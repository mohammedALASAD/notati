from datetime import timedelta
from decimal import Decimal
from io import BytesIO
from unittest.mock import patch

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from pypdf import PdfReader
from reportlab.pdfgen import canvas
from rest_framework.test import APIClient, APIRequestFactory, force_authenticate

from . import pdfutils, verification
from .models import User, Course, Note, NoteFile, Access, BagItem, VerificationCode
from .serializers import NoteSerializer, RegisterSerializer


def _make_pdf(pages=3):
    """Return bytes of a simple multi-page PDF for testing."""
    buf = BytesIO()
    c = canvas.Canvas(buf)
    for i in range(pages):
        c.drawString(100, 700, f'Page {i + 1} body text')
        c.showPage()
    c.save()
    return buf.getvalue()


def _page_text(content):
    return '\n'.join(p.extract_text() or '' for p in PdfReader(BytesIO(content)).pages)


def _serialize_note(note, user=None):
    """Run NoteSerializer with a request context authenticated as `user`."""
    request = APIRequestFactory().get('/api/notes/')
    request.user = user
    if user is not None:
        force_authenticate(request, user=user)
    request.user = user
    return NoteSerializer(note, context={'request': request}).data


class FileAccessGatingTests(TestCase):
    """A paid note must never leak its download URL to a user without access."""

    def setUp(self):
        self.course = Course.objects.create(name='ITIS103')
        self.paid = Note.objects.create(
            course=self.course, chapter_number=1,
            chapter_title='Paid chapter', price=Decimal('2.000'),
        )
        NoteFile.objects.create(
            note=self.paid, label='Lecture',
            file=SimpleUploadedFile('lec.pdf', b'%PDF-1.4 fake'),
        )
        self.free = Note.objects.create(
            course=self.course, chapter_number=2,
            chapter_title='Free chapter', price=Decimal('0'),
        )
        NoteFile.objects.create(
            note=self.free, label='Free lecture',
            file=SimpleUploadedFile('free.pdf', b'%PDF-1.4 fake'),
        )
        self.buyer = User.objects.create_user('buyer@x.com', 'pw', name='Buyer')
        self.stranger = User.objects.create_user('stranger@x.com', 'pw', name='Stranger')
        self.admin = User.objects.create_user('admin@x.com', 'pw', name='Admin', role='admin')
        Access.objects.create(user=self.buyer, note=self.paid)

    def test_stranger_gets_no_url_for_paid_note(self):
        data = _serialize_note(self.paid, self.stranger)
        self.assertFalse(data['has_access'])
        self.assertIsNone(data['files'][0]['file_url'])
        # Metadata (id/label/filename) is still present so the UI can list it.
        self.assertEqual(data['files'][0]['label'], 'Lecture')

    def test_buyer_gets_url_for_paid_note(self):
        data = _serialize_note(self.paid, self.buyer)
        self.assertTrue(data['has_access'])
        self.assertIsNotNone(data['files'][0]['file_url'])

    def test_admin_gets_url_for_paid_note(self):
        data = _serialize_note(self.paid, self.admin)
        self.assertIsNotNone(data['files'][0]['file_url'])

    def test_anyone_gets_url_for_free_note(self):
        data = _serialize_note(self.free, self.stranger)
        self.assertIsNotNone(data['files'][0]['file_url'])


class PasswordPolicyTests(TestCase):
    def test_short_password_rejected(self):
        s = RegisterSerializer(data={'email': 'a@b.com', 'name': 'A', 'password': 'abc12'})
        self.assertFalse(s.is_valid())
        self.assertIn('password', s.errors)

    def test_common_password_rejected(self):
        s = RegisterSerializer(data={'email': 'a@b.com', 'name': 'A', 'password': 'password'})
        self.assertFalse(s.is_valid())
        self.assertIn('password', s.errors)

    def test_strong_password_accepted(self):
        s = RegisterSerializer(data={'email': 'a@b.com', 'name': 'A',
                                     'password': 'Tr0ub4dour!', 'phone': '33112233'})
        self.assertTrue(s.is_valid(), s.errors)


class PdfSampleTests(TestCase):
    def test_sample_keeps_clear_pages_and_blurs_the_rest(self):
        out = pdfutils.sample_pdf(_make_pdf(6))
        text = _page_text(out)
        # 2 clear + up to 6 blurred → all 6 pages present
        self.assertEqual(len(PdfReader(BytesIO(out)).pages), 6)
        # opening pages stay readable
        self.assertIn('Page 1 body text', text)
        # a hidden page's real text is gone (it's now a blurred image)
        self.assertNotIn('Page 4 body text', text)
        # blurred pages carry the upsell
        self.assertIn('Purchase to unlock', text)

    def test_sample_caps_total_pages(self):
        # 2 clear + 6 blurred max = 8, even for a long note
        out = pdfutils.sample_pdf(_make_pdf(40))
        self.assertEqual(len(PdfReader(BytesIO(out)).pages), 8)

    def test_short_note_never_shows_every_page(self):
        out = pdfutils.sample_pdf(_make_pdf(2))
        text = _page_text(out)
        self.assertNotIn('Page 2 body text', text)   # last page hidden
        self.assertIn('Purchase to unlock', text)


class SampleEndpointTests(TestCase):
    def setUp(self):
        self.course = Course.objects.create(name='ITIS103')
        self.note = Note.objects.create(
            course=self.course, chapter_number=1,
            chapter_title='Paid', price=Decimal('2.000'),
        )
        self.nf = NoteFile.objects.create(
            note=self.note, file=SimpleUploadedFile('f.pdf', _make_pdf(6)),
        )

    def test_sample_is_public(self):
        resp = APIClient().get(f'/api/note-files/{self.nf.id}/sample/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp['Content-Type'], 'application/pdf')
        text = _page_text(resp.content)
        self.assertIn('Page 1 body text', text)
        self.assertNotIn('Page 4 body text', text)


class OrderFlowTests(TestCase):
    def setUp(self):
        self.course = Course.objects.create(name='ITIS103')
        self.n1 = Note.objects.create(course=self.course, chapter_number=1,
                                      chapter_title='Ch1', price=Decimal('2.000'))
        self.n2 = Note.objects.create(course=self.course, chapter_number=2,
                                      chapter_title='Ch2', price=Decimal('3.000'))
        self.student = User.objects.create_user('s@x.com', 'pw', name='S')
        self.admin = User.objects.create_user('a@x.com', 'pw', name='A', role='admin')
        BagItem.objects.create(user=self.student, note=self.n1)
        BagItem.objects.create(user=self.student, note=self.n2)

    def _client(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def test_place_order_from_bag_clears_bag(self):
        resp = self._client(self.student).post('/api/orders/')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['status'], 'pending')
        self.assertEqual(Decimal(resp.data['total']), Decimal('5.000'))
        self.assertEqual(resp.data['item_count'], 2)
        self.assertEqual(BagItem.objects.filter(user=self.student).count(), 0)

    def test_empty_bag_is_rejected(self):
        BagItem.objects.filter(user=self.student).delete()
        resp = self._client(self.student).post('/api/orders/')
        self.assertEqual(resp.status_code, 400)

    def test_order_from_explicit_note_ids(self):
        # Even with an empty server bag, an order can be placed from note_ids.
        BagItem.objects.filter(user=self.student).delete()
        resp = self._client(self.student).post(
            '/api/orders/', {'note_ids': [self.n1.id, self.n2.id]}, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['item_count'], 2)
        self.assertEqual(Decimal(resp.data['total']), Decimal('5.000'))

    def test_admin_mark_paid_grants_access_to_all_items(self):
        order_id = self._client(self.student).post('/api/orders/').data['id']
        self.assertFalse(Access.objects.filter(user=self.student, note=self.n1).exists())
        resp = self._client(self.admin).patch(
            f'/api/admin/orders/{order_id}/', {'status': 'paid'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['status'], 'paid')
        self.assertIsNotNone(resp.data['paid_at'])
        self.assertTrue(Access.objects.filter(user=self.student, note=self.n1).exists())
        self.assertTrue(Access.objects.filter(user=self.student, note=self.n2).exists())

    def test_students_cannot_see_admin_orders(self):
        resp = self._client(self.student).get('/api/admin/orders/')
        self.assertEqual(resp.status_code, 403)


class EmailVerificationTests(TestCase):
    def setUp(self):
        cache.clear()  # reset throttle counters between tests

    def _register(self, email='new@x.com', extra=None):
        captured = {}
        def fake_send(user, code, purpose):
            captured['code'] = code
            captured['purpose'] = purpose
        payload = {'name': 'New', 'email': email, 'password': 'Tr0ub4dour!', 'phone': '33112233'}
        if extra:
            payload.update(extra)
        with patch('api.views.emails.send_code_email', side_effect=fake_send):
            resp = APIClient().post('/api/auth/register/', payload, format='json')
        return resp, captured

    def test_register_creates_inactive_account(self):
        resp, _ = self._register()
        self.assertEqual(resp.status_code, 201)
        self.assertNotIn('access', resp.data)
        u = User.objects.get(email='new@x.com')
        self.assertFalse(u.is_active)
        self.assertEqual(u.phone, '33112233')

    def test_inactive_account_cannot_login(self):
        self._register()
        login = APIClient().post('/api/auth/login/',
                                 {'email': 'new@x.com', 'password': 'Tr0ub4dour!'}, format='json')
        self.assertNotEqual(login.status_code, 200)

    def test_verify_activates_and_returns_tokens(self):
        _, cap = self._register()
        v = APIClient().post('/api/auth/verify/',
                             {'email': 'new@x.com', 'code': cap['code']}, format='json')
        self.assertEqual(v.status_code, 200)
        self.assertIn('access', v.data)
        self.assertTrue(User.objects.get(email='new@x.com').is_active)

    def test_verify_wrong_code_fails(self):
        self._register()
        v = APIClient().post('/api/auth/verify/',
                             {'email': 'new@x.com', 'code': '000000'}, format='json')
        self.assertEqual(v.status_code, 400)
        self.assertFalse(User.objects.get(email='new@x.com').is_active)

    def test_phone_is_required(self):
        resp = APIClient().post('/api/auth/register/',
                                {'name': 'X', 'email': 'np@x.com', 'password': 'Tr0ub4dour!'}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_cleanup_removes_expired_unverified(self):
        u = User.objects.create_user('old@x.com', 'pw', name='Old', is_active=False)
        VerificationCode.objects.create(user=u, purpose='activate', code_hash='x',
                                        expires_at=timezone.now() - timedelta(minutes=1))
        verification.cleanup_unverified()
        self.assertFalse(User.objects.filter(email='old@x.com').exists())

    def test_cleanup_keeps_valid_pending(self):
        self._register()  # fresh code valid for 5 min
        verification.cleanup_unverified()
        self.assertTrue(User.objects.filter(email='new@x.com').exists())

    def test_password_reset_flow(self):
        User.objects.create_user('r@x.com', 'OldPass123!', name='R')  # active
        captured = {}
        with patch('api.views.emails.send_code_email',
                   side_effect=lambda user, code, purpose: captured.update(code=code)):
            APIClient().post('/api/auth/password/forgot/', {'email': 'r@x.com'}, format='json')
        resp = APIClient().post('/api/auth/password/reset/', {
            'email': 'r@x.com', 'code': captured['code'], 'new_password': 'Br4ndNew!!'
        }, format='json')
        self.assertEqual(resp.status_code, 200)
        login = APIClient().post('/api/auth/login/',
                                 {'email': 'r@x.com', 'password': 'Br4ndNew!!'}, format='json')
        self.assertEqual(login.status_code, 200)


class BroadcastEmailTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user('a@x.com', 'pw', name='A', role='admin')
        self.s1 = User.objects.create_user('s1@x.com', 'pw', name='S1')          # active student
        self.s2 = User.objects.create_user('s2@x.com', 'pw', name='S2')          # active student
        User.objects.create_user('inactive@x.com', 'pw', name='S3', is_active=False)  # excluded

    def _admin(self):
        c = APIClient()
        c.force_authenticate(self.admin)
        return c

    def test_broadcast_sends_to_active_students_only(self):
        sent = []
        with patch('api.emails.send_support_email',
                   side_effect=lambda email, name, subject, message: sent.append(email)):
            resp = self._admin().post('/api/admin/broadcast-email/',
                                      {'subject': 'Hi', 'message': 'Welcome'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['count'], 2)
        self.assertCountEqual(sent, ['s1@x.com', 's2@x.com'])

    def test_broadcast_requires_subject_and_message(self):
        resp = self._admin().post('/api/admin/broadcast-email/', {'subject': 'Hi'}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_students_cannot_broadcast(self):
        resp = APIClient()
        resp.force_authenticate(self.s1)
        r = resp.post('/api/admin/broadcast-email/',
                      {'subject': 'Hi', 'message': 'x'}, format='json')
        self.assertEqual(r.status_code, 403)
