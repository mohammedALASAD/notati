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
from .models import (User, Course, Note, NoteFile, Access, BagItem, VerificationCode,
                     Order, DiscountCode, DiscountRedemption, Upload, UploadFile)
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

    def test_buyer_gets_no_direct_url_for_paid_note(self):
        # A buyer has access but must download through the fingerprinting proxy,
        # so the direct Cloudinary URL is withheld even though has_access is true.
        data = _serialize_note(self.paid, self.buyer)
        self.assertTrue(data['has_access'])
        self.assertIsNone(data['files'][0]['file_url'])

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

    def test_order_stores_and_returns_code(self):
        resp = self._client(self.student).post(
            '/api/orders/', {'code': 'ab12cd'}, format='json')
        self.assertEqual(resp.status_code, 201)
        # Stored upper-cased so it matches the code the student sends on WhatsApp.
        self.assertEqual(resp.data['code'], 'AB12CD')

    def test_stale_pending_orders_auto_cancel_on_admin_load(self):
        from django.utils import timezone
        from datetime import timedelta
        order_id = self._client(self.student).post('/api/orders/').data['id']
        # Backdate it past the stale window.
        Order.objects.filter(pk=order_id).update(
            created_at=timezone.now() - timedelta(days=4))
        # Admin loading the orders list triggers the lazy cleanup.
        self._client(self.admin).get('/api/admin/orders/')
        self.assertEqual(Order.objects.get(pk=order_id).status, 'cancelled')

    def test_recent_pending_orders_are_not_cancelled(self):
        order_id = self._client(self.student).post('/api/orders/').data['id']
        self._client(self.admin).get('/api/admin/orders/')
        self.assertEqual(Order.objects.get(pk=order_id).status, 'pending')


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


class DiscountCodeTests(TestCase):
    def setUp(self):
        cache.clear()  # reset throttle counters
        self.course = Course.objects.create(name='ITIS103')
        self.n1 = Note.objects.create(course=self.course, chapter_number=1,
                                      chapter_title='Ch1', price=Decimal('2.000'))
        self.n2 = Note.objects.create(course=self.course, chapter_number=2,
                                      chapter_title='Ch2', price=Decimal('3.000'))
        self.student = User.objects.create_user('s@x.com', 'pw', name='S')
        self.other   = User.objects.create_user('o@x.com', 'pw', name='O')
        self.admin   = User.objects.create_user('a@x.com', 'pw', name='A', role='admin')
        self.code = DiscountCode.objects.create(code='SAVE20', percent=20, active=True)

    def _c(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def _order(self, user, code='SAVE20', ids=None):
        body = {'note_ids': ids if ids is not None else [self.n1.id, self.n2.id]}
        if code is not None:
            body['discount_code'] = code
        return self._c(user).post('/api/orders/', body, format='json')

    def test_valid_code_discounts_total_and_records(self):
        resp = self._order(self.student)
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(Decimal(resp.data['subtotal']), Decimal('5.000'))
        self.assertEqual(resp.data['discount_percent'], 20)
        self.assertEqual(resp.data['discount_code'], 'SAVE20')
        self.assertEqual(Decimal(resp.data['total']), Decimal('4.000'))  # 5 - 20%
        self.assertTrue(DiscountRedemption.objects.filter(code=self.code, user=self.student).exists())

    def test_case_insensitive_code(self):
        resp = self._order(self.student, code='save20')
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['discount_code'], 'SAVE20')

    def test_unknown_code_rejected(self):
        resp = self._order(self.student, code='NOPE')
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(Order.objects.filter(user=self.student).exists())

    def test_once_per_student(self):
        self.assertEqual(self._order(self.student).status_code, 201)
        # Second order with the same code is blocked for the same student.
        second = self._order(self.student)
        self.assertEqual(second.status_code, 400)
        # A different student can still use it.
        self.assertEqual(self._order(self.other).status_code, 201)

    def test_cancel_frees_the_code(self):
        order_id = self._order(self.student).data['id']
        self.assertEqual(self._order(self.student).status_code, 400)  # locked
        # Admin cancels -> redemption released.
        self._c(self.admin).patch(f'/api/admin/orders/{order_id}/',
                                  {'status': 'cancelled'}, format='json')
        self.assertFalse(DiscountRedemption.objects.filter(user=self.student).exists())
        self.assertEqual(self._order(self.student).status_code, 201)

    def test_expired_code_rejected(self):
        self.code.valid_until = timezone.now() - timedelta(minutes=1)
        self.code.save()
        self.assertEqual(self._order(self.student).status_code, 400)

    def test_not_yet_active_code_rejected(self):
        self.code.valid_from = timezone.now() + timedelta(days=1)
        self.code.save()
        self.assertEqual(self._order(self.student).status_code, 400)

    def test_inactive_code_rejected(self):
        self.code.active = False
        self.code.save()
        self.assertEqual(self._order(self.student).status_code, 400)

    def test_max_uses_cap(self):
        self.code.max_uses = 1
        self.code.save()
        self.assertEqual(self._order(self.student).status_code, 201)
        self.assertEqual(self._order(self.other).status_code, 400)  # cap reached

    def test_order_without_code_is_full_price(self):
        resp = self._order(self.student, code=None)
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['discount_percent'], 0)
        self.assertEqual(Decimal(resp.data['total']), Decimal('5.000'))

    def test_validate_endpoint(self):
        resp = self._c(self.student).post('/api/discount/validate/', {'code': 'SAVE20'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['valid'])
        self.assertEqual(resp.data['percent'], 20)

    def test_validate_rejects_used_code(self):
        self._order(self.student)
        resp = self._c(self.student).post('/api/discount/validate/', {'code': 'SAVE20'}, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(resp.data['valid'])

    def test_admin_can_create_student_cannot(self):
        ok = self._c(self.admin).post('/api/admin/discounts/',
                                      {'code': 'new10', 'percent': 10}, format='json')
        self.assertEqual(ok.status_code, 201)
        self.assertEqual(ok.data['code'], 'NEW10')  # uppercased
        forbidden = self._c(self.student).post('/api/admin/discounts/',
                                               {'code': 'X20', 'percent': 20}, format='json')
        self.assertEqual(forbidden.status_code, 403)

    def test_admin_rejects_bad_percent(self):
        resp = self._c(self.admin).post('/api/admin/discounts/',
                                        {'code': 'BAD', 'percent': 150}, format='json')
        self.assertEqual(resp.status_code, 400)


class SalesDiscountTests(TestCase):
    """The sales view must report revenue net of discounts and flag discounted sales."""
    def setUp(self):
        cache.clear()
        self.course = Course.objects.create(name='ITIS103')
        self.n1 = Note.objects.create(course=self.course, chapter_number=1,
                                      chapter_title='Ch1', price=Decimal('2.000'))
        self.n2 = Note.objects.create(course=self.course, chapter_number=2,
                                      chapter_title='Ch2', price=Decimal('3.000'))
        self.student = User.objects.create_user('s@x.com', 'pw', name='S')
        self.full    = User.objects.create_user('f@x.com', 'pw', name='F')
        self.admin   = User.objects.create_user('a@x.com', 'pw', name='A', role='admin')
        DiscountCode.objects.create(code='HALF', percent=50, active=True)

    def _c(self, user):
        c = APIClient(); c.force_authenticate(user); return c

    def _paid_order(self, user, ids, code=None):
        body = {'note_ids': ids}
        if code:
            body['discount_code'] = code
        oid = self._c(user).post('/api/orders/', body, format='json').data['id']
        self._c(self.admin).patch(f'/api/admin/orders/{oid}/', {'status': 'paid'}, format='json')

    def test_revenue_is_net_of_discount(self):
        # Student buys both notes (BD5) with 50% off -> paid BD2.5
        self._paid_order(self.student, [self.n1.id, self.n2.id], code='HALF')
        # Another student buys n1 at full price (BD2)
        self._paid_order(self.full, [self.n1.id])

        data = self._c(self.admin).get('/api/admin/sales/').data
        # Net revenue: discounted 2.5 + full 2.0 = 4.5 (gross would be 7.0)
        self.assertEqual(Decimal(data['total_revenue']), Decimal('4.500'))
        self.assertEqual(Decimal(data['total_gross_revenue']), Decimal('7.000'))
        self.assertEqual(data['total_sales'], 3)
        self.assertEqual(data['total_discounted_sales'], 2)

        row1 = next(r for r in data['rows'] if r['id'] == self.n1.id)
        # n1 sold twice: 1.0 (discounted) + 2.0 (full) = 3.0
        self.assertEqual(Decimal(row1['revenue']), Decimal('3.000'))
        self.assertEqual(row1['discounted_sales'], 1)
        self.assertEqual(row1['sales'], 2)

    def test_manual_access_counts_at_list_price(self):
        # A manual unlock (no order) should still count at full price, no discount flag.
        Access.objects.create(user=self.student, note=self.n1)
        data = self._c(self.admin).get('/api/admin/sales/').data
        row1 = next(r for r in data['rows'] if r['id'] == self.n1.id)
        self.assertEqual(Decimal(row1['revenue']), Decimal('2.000'))
        self.assertEqual(row1['discounted_sales'], 0)


class UnverifiedCleanupTriggerTests(TestCase):
    """Expired never-activated accounts get purged on login + admin user-list load,
    and are never shown in the admin users list."""
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_user('admin@x.com', 'pw', name='Admin', role='admin')
        # An expired, never-activated student (code expired in the past).
        self.ghost = User.objects.create_user('ghost@x.com', 'pw', name='Ghost', is_active=False)
        VerificationCode.objects.create(user=self.ghost, purpose='activate', code_hash='x',
                                        expires_at=timezone.now() - timedelta(minutes=1))

    def test_admin_user_list_purges_and_hides_unverified(self):
        c = APIClient(); c.force_authenticate(self.admin)
        resp = c.get('/api/admin/users/')
        rows = resp.data['results'] if isinstance(resp.data, dict) else resp.data
        emails = [u['email'] for u in rows]
        self.assertNotIn('ghost@x.com', emails)
        self.assertFalse(User.objects.filter(email='ghost@x.com').exists())

    def test_login_purges_unverified(self):
        APIClient().post('/api/auth/login/',
                         {'email': 'admin@x.com', 'password': 'pw'}, format='json')
        self.assertFalse(User.objects.filter(email='ghost@x.com').exists())

    def test_fresh_unverified_is_kept_but_hidden(self):
        fresh = User.objects.create_user('fresh@x.com', 'pw', name='Fresh', is_active=False)
        VerificationCode.objects.create(user=fresh, purpose='activate', code_hash='x',
                                        expires_at=timezone.now() + timedelta(minutes=5))
        c = APIClient(); c.force_authenticate(self.admin)
        resp = c.get('/api/admin/users/')
        rows = resp.data['results'] if isinstance(resp.data, dict) else resp.data
        emails = [u['email'] for u in rows]
        self.assertNotIn('fresh@x.com', emails)           # hidden from admin list
        self.assertTrue(User.objects.filter(email='fresh@x.com').exists())  # but not deleted yet


class LeakTracingTests(TestCase):
    """Per-download fingerprinting: paid notes are stamped with a per-student code,
    each download is logged, and a code reverses back to the student."""

    def setUp(self):
        from .models import DownloadLog
        from . import tracing
        self.tracing = tracing
        self.DownloadLog = DownloadLog
        self.course = Course.objects.create(name='ITCY460')
        self.note = Note.objects.create(course=self.course, chapter_number=2,
                                        chapter_title='Risk framework', price=Decimal('1.500'))
        self.student = User.objects.create_user('stud@x.com', 'pw', name='Stud')
        self.admin = User.objects.create_user('adm@x.com', 'pw', name='Adm', role='admin')
        Access.objects.create(user=self.student, note=self.note)

    def _client(self, user):
        c = APIClient(); c.force_authenticate(user); return c

    def test_code_is_deterministic_and_distinct(self):
        a1 = self.tracing.code_for(self.student.id, self.note.id)
        a2 = self.tracing.code_for(self.student.id, self.note.id)
        self.assertEqual(a1, a2)                                  # stable per (user, note)
        other = User.objects.create_user('o@x.com', 'pw', name='O')
        self.assertNotEqual(a1, self.tracing.code_for(other.id, self.note.id))

    def test_fingerprint_pdf_embeds_code_and_keeps_content(self):
        stamped = pdfutils.fingerprint_pdf(_make_pdf(3), 'ABC12XYZ')
        reader = PdfReader(BytesIO(stamped))
        self.assertEqual(len(reader.pages), 3)
        self.assertEqual(reader.metadata.get('/NotatiTrace'), 'ABC12XYZ')
        self.assertIn('Page 1 body text', _page_text(stamped))     # original kept
        self.assertIn('NT-ABC12XYZ', _page_text(stamped))          # code present

    def test_fingerprint_pdf_passes_through_non_pdf(self):
        junk = b'not a pdf'
        self.assertEqual(pdfutils.fingerprint_pdf(junk, 'X'), junk)

    def test_download_stamps_pdf_and_logs(self):
        pdf = _make_pdf(2)
        with patch('api.views._fetch_file_bytes', return_value=(pdf, 'application/pdf')):
            self.note.pdf_file = 'notes/x.pdf'      # truthy; bytes come from the mock
            self.note.save(update_fields=['pdf_file'])
            resp = self._client(self.student).get(f'/api/notes/{self.note.id}/download/')
        self.assertEqual(resp.status_code, 200)
        content = b''.join(resp.streaming_content) if resp.streaming else resp.content
        code = self.tracing.code_for(self.student.id, self.note.id)
        self.assertEqual(PdfReader(BytesIO(content)).metadata.get('/NotatiTrace'), code)
        log = self.DownloadLog.objects.get(user=self.student, note=self.note)
        self.assertEqual(log.code, code)

    def test_admin_download_is_not_stamped(self):
        pdf = _make_pdf(1)
        with patch('api.views._fetch_file_bytes', return_value=(pdf, 'application/pdf')):
            self.note.pdf_file = 'notes/x.pdf'
            self.note.save(update_fields=['pdf_file'])
            resp = self._client(self.admin).get(f'/api/notes/{self.note.id}/download/')
        content = b''.join(resp.streaming_content) if resp.streaming else resp.content
        self.assertIsNone(PdfReader(BytesIO(content)).metadata.get('/NotatiTrace') if PdfReader(BytesIO(content)).metadata else None)
        self.assertFalse(self.DownloadLog.objects.filter(user=self.admin).exists())

    def test_admin_trace_lookup(self):
        code = self.tracing.code_for(self.student.id, self.note.id)
        self.DownloadLog.objects.create(user=self.student, note=self.note, code=code, ip='1.2.3.4')
        resp = self._client(self.admin).get(f'/api/admin/trace/?code={code}')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['matches']), 1)
        self.assertEqual(resp.data['matches'][0]['email'], 'stud@x.com')

    def test_trace_lookup_recomputes_without_log(self):
        code = self.tracing.code_for(self.student.id, self.note.id)
        matches = self.tracing.find_by_code(code)   # no DownloadLog rows exist
        self.assertTrue(any(m['user_id'] == self.student.id for m in matches))

    def test_trace_lookup_tolerates_on_page_prefix(self):
        # The on-page text reads "NT-<code>"; looking that up verbatim must work.
        code = self.tracing.code_for(self.student.id, self.note.id)
        matches = self.tracing.find_by_code(f'nt-{code.lower()}')
        self.assertTrue(any(m['user_id'] == self.student.id for m in matches))

    def test_students_cannot_use_trace_lookup(self):
        resp = self._client(self.student).get('/api/admin/trace/?code=ABC')
        self.assertEqual(resp.status_code, 403)

    def test_note_views_counts_opens_and_unique_students(self):
        other = User.objects.create_user('o2@x.com', 'pw', name='O2')
        # student opens twice, another student once → 3 opens, 2 students
        for u in (self.student, self.student, other):
            self.DownloadLog.objects.create(user=u, note=self.note,
                                            code=self.tracing.code_for(u.id, self.note.id))
        resp = self._client(self.admin).get('/api/admin/note-views/')
        self.assertEqual(resp.status_code, 200)
        row = next(r for r in resp.data if r['id'] == self.note.id)
        self.assertEqual(row['opens'], 3)
        self.assertEqual(row['students'], 2)
        self.assertFalse(row['is_free'])

    def test_students_cannot_use_note_views(self):
        resp = self._client(self.student).get('/api/admin/note-views/')
        self.assertEqual(resp.status_code, 403)

    def test_guest_open_of_free_note_is_logged_unstamped(self):
        free = Note.objects.create(course=self.course, chapter_number=9,
                                   chapter_title='Intro', price=Decimal('0'))
        pdf = _make_pdf(1)
        with patch('api.views._fetch_file_bytes', return_value=(pdf, 'application/pdf')):
            free.pdf_file = 'notes/free.pdf'
            free.save(update_fields=['pdf_file'])
            resp = APIClient().get(f'/api/notes/{free.id}/download/')   # no auth = guest
        self.assertEqual(resp.status_code, 200)
        log = self.DownloadLog.objects.get(note=free, user__isnull=True)
        self.assertEqual(log.code, '')                                  # no trace code for guests
        content = b''.join(resp.streaming_content) if resp.streaming else resp.content
        meta = PdfReader(BytesIO(content)).metadata
        self.assertIsNone(meta.get('/NotatiTrace') if meta else None)   # guest gets clean master

    def test_guest_cannot_open_paid_note_and_is_not_logged(self):
        pdf = _make_pdf(1)
        with patch('api.views._fetch_file_bytes', return_value=(pdf, 'application/pdf')):
            self.note.pdf_file = 'notes/x.pdf'
            self.note.save(update_fields=['pdf_file'])
            resp = APIClient().get(f'/api/notes/{self.note.id}/download/')   # paid, no auth
        self.assertEqual(resp.status_code, 401)
        self.assertFalse(self.DownloadLog.objects.filter(user__isnull=True).exists())

    def test_note_views_reports_guest_opens(self):
        free = Note.objects.create(course=self.course, chapter_number=8,
                                   chapter_title='Basics', price=Decimal('0'))
        self.DownloadLog.objects.create(user=None, note=free, code='', ip='9.9.9.9')
        self.DownloadLog.objects.create(user=None, note=free, code='', ip='9.9.9.8')
        self.DownloadLog.objects.create(user=self.student, note=free,
                                        code=self.tracing.code_for(self.student.id, free.id))
        resp = self._client(self.admin).get('/api/admin/note-views/')
        row = next(r for r in resp.data if r['id'] == free.id)
        self.assertEqual(row['opens'], 3)          # 2 guests + 1 student
        self.assertEqual(row['students'], 1)       # unique accounts (guests excluded)
        self.assertEqual(row['guest_opens'], 2)


class AdminAlertTests(TestCase):
    """A student placing an order, uploading, or reviewing emails the admin."""

    def setUp(self):
        self.student = User.objects.create_user('sara@x.com', 'pw', name='Sara Ali')
        self.admin = User.objects.create_user('adm@x.com', 'pw', name='Adm', role='admin')
        self.course = Course.objects.create(name='ITIS103')
        self.note = Note.objects.create(course=self.course, chapter_number=1,
                                        chapter_title='Intro', price=Decimal('1.500'))

    def _client(self, user):
        c = APIClient(); c.force_authenticate(user); return c

    @patch('api.emails._send_async')
    def test_order_alerts_admin(self, mock_send):
        resp = self._client(self.student).post(
            '/api/orders/', {'note_ids': [self.note.id], 'code': 'AB12CD'}, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(mock_send.called)
        payload = mock_send.call_args[0][0]
        self.assertEqual(payload['to'], ['support@notati.app'])
        self.assertIn('order', payload['subject'].lower())
        self.assertIn('sara@x.com', payload['html'])
        self.assertIn('Open Notati', payload['html'])          # button label
        self.assertIn('https://notati.app', payload['html'])   # button link

    @patch('api.emails._send_async')
    def test_upload_alerts_admin(self, mock_send):
        resp = self._client(self.student).post(
            '/api/uploads/', {'title': 'My lecture notes'}, format='json')
        self.assertIn(resp.status_code, (200, 201))
        self.assertTrue(mock_send.called)
        self.assertIn('upload', mock_send.call_args[0][0]['subject'].lower())

    @patch('api.emails._send_async')
    def test_review_alerts_admin(self, mock_send):
        resp = self._client(self.student).post(
            '/api/testimonials/submit/', {'text': 'Great, clear notes!'}, format='json')
        self.assertIn(resp.status_code, (200, 201))
        self.assertTrue(mock_send.called)
        self.assertIn('review', mock_send.call_args[0][0]['subject'].lower())

    @patch('api.emails._send_async')
    def test_admin_own_actions_do_not_alert(self, mock_send):
        # Admin leaving a review should not email the admin (no self-notification).
        self._client(self.admin).post(
            '/api/testimonials/submit/', {'text': 'internal'}, format='json')
        self.assertFalse(mock_send.called)


class IdorTests(TestCase):
    """IDs are sequential integers (BigAutoField), so they're trivially guessable.
    That's only safe because the server authorises every object access instead of
    trusting the ID. Here 'Mallory' plays the attacker: she guesses 'Alice's'
    resource IDs from the URL and must be refused on every one. The positive-control
    tests at the end prove the refusals are *targeted* — Alice and the admin still
    get through — so a passing suite can't just be a blanket 403/404 on everything."""

    def setUp(self):
        self.alice = User.objects.create_user('alice@x.com', 'pw', name='Alice')
        self.mallory = User.objects.create_user('mallory@x.com', 'pw', name='Mallory')
        self.admin = User.objects.create_user('adm@x.com', 'pw', name='Adm', role='admin')

        self.course = Course.objects.create(name='ITIS103')
        # A paid note Mallory has NOT bought.
        self.paid = Note.objects.create(course=self.course, chapter_number=1,
                                        chapter_title='Paid', price=Decimal('2.000'))
        self.paid_file = NoteFile.objects.create(
            note=self.paid, file=SimpleUploadedFile('p.pdf', b'%PDF-1.4 x'))

        # Everything below belongs to Alice. Mallory owns none of it.
        self.alice_upload = Upload.objects.create(
            user=self.alice, title="Alice's notes",
            file=SimpleUploadedFile('a.pdf', b'%PDF-1.4 x'))
        self.alice_file = UploadFile.objects.create(
            upload=self.alice_upload, file=SimpleUploadedFile('af.pdf', b'%PDF-1.4 x'))
        self.alice_order = Order.objects.create(user=self.alice, status='pending')

    def _c(self, user):
        c = APIClient(); c.force_authenticate(user); return c

    def _rows(self, resp):
        return resp.data['results'] if isinstance(resp.data, dict) else resp.data

    # ── Uploads: queryset is scoped to the owner, so a guessed ID looks absent (404) ──

    def test_cannot_read_another_students_upload(self):
        resp = self._c(self.mallory).get(f'/api/uploads/{self.alice_upload.id}/')
        self.assertEqual(resp.status_code, 404)

    def test_cannot_modify_another_students_upload(self):
        resp = self._c(self.mallory).patch(
            f'/api/uploads/{self.alice_upload.id}/', {'title': 'hacked'}, format='json')
        self.assertEqual(resp.status_code, 404)
        self.alice_upload.refresh_from_db()
        self.assertEqual(self.alice_upload.title, "Alice's notes")   # untouched

    def test_cannot_delete_another_students_upload(self):
        resp = self._c(self.mallory).delete(f'/api/uploads/{self.alice_upload.id}/')
        self.assertEqual(resp.status_code, 404)
        self.assertTrue(Upload.objects.filter(id=self.alice_upload.id).exists())

    # ── Downloads: explicit ownership check returns 403 before any file is served ──

    def test_cannot_download_another_students_upload(self):
        resp = self._c(self.mallory).get(f'/api/uploads/{self.alice_upload.id}/download/')
        self.assertEqual(resp.status_code, 403)

    def test_cannot_download_another_students_upload_file(self):
        resp = self._c(self.mallory).get(f'/api/upload-files/{self.alice_file.id}/download/')
        self.assertEqual(resp.status_code, 403)

    def test_cannot_read_another_students_upload_file_metadata(self):
        resp = self._c(self.mallory).get(f'/api/upload-files/{self.alice_file.id}/')
        self.assertEqual(resp.status_code, 404)

    # ── Paid notes: no Access grant → 403; not logged in → 401 ──

    def test_cannot_download_paid_note_without_access(self):
        resp = self._c(self.mallory).get(f'/api/notes/{self.paid.id}/download/')
        self.assertEqual(resp.status_code, 403)

    def test_cannot_download_paid_note_file_without_access(self):
        resp = self._c(self.mallory).get(f'/api/note-files/{self.paid_file.id}/download/')
        self.assertEqual(resp.status_code, 403)

    def test_guest_cannot_download_paid_note(self):
        resp = APIClient().get(f'/api/notes/{self.paid.id}/download/')
        self.assertEqual(resp.status_code, 401)

    # ── Orders: a student only ever sees their own list, and can't change status ──

    def test_order_list_is_scoped_to_owner(self):
        resp = self._c(self.mallory).get('/api/orders/')
        self.assertEqual(resp.status_code, 200)
        ids = [o['id'] for o in self._rows(resp)]
        self.assertNotIn(self.alice_order.id, ids)   # Alice's order is invisible to Mallory

    def test_student_cannot_change_order_status(self):
        # The only order-detail route is admin-only, so a student PATCH is refused
        # and the order is left untouched.
        resp = self._c(self.mallory).patch(
            f'/api/admin/orders/{self.alice_order.id}/', {'status': 'paid'}, format='json')
        self.assertEqual(resp.status_code, 403)
        self.alice_order.refresh_from_db()
        self.assertEqual(self.alice_order.status, 'pending')

    # ── Admin-only endpoint the screenshot came from: user records ──

    def test_student_cannot_read_admin_user_detail(self):
        resp = self._c(self.mallory).get(f'/api/admin/users/{self.alice.id}/')
        self.assertEqual(resp.status_code, 403)

    # ── Positive controls: the refusals above are authorisation, not broken routes ──

    def test_owner_can_read_her_own_upload(self):
        resp = self._c(self.alice).get(f'/api/uploads/{self.alice_upload.id}/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['title'], "Alice's notes")

    def test_admin_can_read_any_upload(self):
        resp = self._c(self.admin).get(f'/api/uploads/{self.alice_upload.id}/')
        self.assertEqual(resp.status_code, 200)

    def test_ids_really_are_sequential(self):
        # Proves the premise of the whole class: consecutive rows get consecutive IDs,
        # so an attacker can guess a neighbour's ID by ±1. Safety comes from the
        # authorisation checks above, not from the IDs being unguessable.
        u1 = Upload.objects.create(user=self.alice, title='one')
        u2 = Upload.objects.create(user=self.mallory, title='two')
        self.assertEqual(u2.id, u1.id + 1)


class EmailNormalizationTests(TestCase):
    """One email address = one account, regardless of letter case. Emails are
    stored lowercased so 'Fatima@…' and 'fatima@…' can't both sign up."""

    def setUp(self):
        cache.clear()  # reset register throttle counters

    def _register(self, email):
        with patch('api.views.emails.send_code_email'):
            return APIClient().post('/api/auth/register/', {
                'name': 'X', 'email': email, 'password': 'Tr0ub4dour!', 'phone': '33112233',
            }, format='json')

    def test_email_is_stored_lowercased(self):
        resp = self._register('Fatima@Gmail.com')
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(User.objects.filter(email='fatima@gmail.com').exists())
        self.assertFalse(User.objects.filter(email='Fatima@Gmail.com').exists())

    def test_case_variant_of_existing_account_is_rejected(self):
        User.objects.create_user('fatima@gmail.com', 'pw', name='Fatima')  # active
        resp = self._register('FATIMA@gmail.com')
        self.assertEqual(resp.status_code, 400)
        # Still exactly one account for that address.
        self.assertEqual(User.objects.filter(email__iexact='fatima@gmail.com').count(), 1)


class LoginLockoutTests(TestCase):
    """Four consecutive wrong passwords lock the account for an hour. A correct
    password or a password reset clears the streak."""

    def setUp(self):
        cache.clear()  # reset per-IP login throttle counters
        self.pw = 'Correct-Horse-9'
        self.user = User.objects.create_user('lock@x.com', self.pw, name='Locky')

    def _login(self, password):
        return APIClient().post(
            '/api/auth/login/', {'email': 'lock@x.com', 'password': password}, format='json')

    def test_four_wrong_attempts_lock_the_account(self):
        for _ in range(3):
            self.assertEqual(self._login('nope').status_code, 401)   # invalid creds
        fourth = self._login('nope')                                 # trips the lock
        self.assertEqual(fourth.status_code, 429)
        self.assertIn('locked', fourth.data['detail'].lower())
        # The correct password is refused while the lock is active.
        self.assertEqual(self._login(self.pw).status_code, 429)

    def test_success_resets_the_streak(self):
        self.assertEqual(self._login('nope').status_code, 401)
        self.assertEqual(self._login('nope').status_code, 401)
        self.assertEqual(self._login(self.pw).status_code, 200)      # correct → resets
        self.user.refresh_from_db()
        self.assertEqual(self.user.failed_login_attempts, 0)
        self.assertIsNone(self.user.login_locked_until)

    def test_password_reset_lifts_the_lock(self):
        for _ in range(4):
            self._login('nope')                                      # lock it
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.login_locked_until)
        captured = {}
        with patch('api.views.emails.send_code_email',
                   side_effect=lambda u, code, purpose: captured.update(code=code)):
            APIClient().post('/api/auth/password/forgot/', {'email': 'lock@x.com'}, format='json')
        resp = APIClient().post('/api/auth/password/reset/', {
            'email': 'lock@x.com', 'code': captured['code'], 'new_password': 'Br4ndNew!!',
        }, format='json')
        self.assertEqual(resp.status_code, 200)
        self.user.refresh_from_db()
        self.assertIsNone(self.user.login_locked_until)
        self.assertEqual(self.user.failed_login_attempts, 0)

    def test_unknown_email_never_locks_and_does_not_error(self):
        resp = APIClient().post(
            '/api/auth/login/', {'email': 'ghost@x.com', 'password': 'x'}, format='json')
        self.assertEqual(resp.status_code, 401)   # ordinary invalid credentials, no crash


class OrderPaidEmailTests(TestCase):
    """When the admin marks an order paid (granting access), the student gets a
    'chapters unlocked' email with the chapter list and a button to the library."""

    def setUp(self):
        cache.clear()
        self.course = Course.objects.create(name='MGMT233', college='Business')
        self.n1 = Note.objects.create(course=self.course, chapter_number=4,
                                      chapter_title='Working Capital', price=Decimal('2.000'))
        self.student = User.objects.create_user('buyer@x.com', 'pw', name='Sara Ali')
        self.admin = User.objects.create_user('adm@x.com', 'pw', name='Adm', role='admin')

    def _c(self, user):
        c = APIClient(); c.force_authenticate(user); return c

    def _place_order(self):
        return self._c(self.student).post(
            '/api/orders/', {'note_ids': [self.n1.id]}, format='json').data['id']

    @patch('api.emails._send_async')
    def test_marking_paid_emails_the_customer(self, mock_send):
        oid = self._place_order()
        mock_send.reset_mock()   # ignore the admin-alert email from order placement
        resp = self._c(self.admin).patch(
            f'/api/admin/orders/{oid}/', {'status': 'paid'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(mock_send.called)
        payload = mock_send.call_args[0][0]
        self.assertEqual(payload['to'], ['buyer@x.com'])
        self.assertIn('unlock', payload['subject'].lower())
        self.assertIn('Working Capital', payload['html'])       # the chapter they bought
        self.assertIn('https://notati.app', payload['html'])    # button link to the library

    @patch('api.emails._send_async')
    def test_paid_order_is_not_re_emailed(self, mock_send):
        oid = self._place_order()
        self._c(self.admin).patch(f'/api/admin/orders/{oid}/', {'status': 'paid'}, format='json')
        mock_send.reset_mock()
        # Saving an already-paid order again must not re-send the unlock email.
        self._c(self.admin).patch(f'/api/admin/orders/{oid}/', {'status': 'paid'}, format='json')
        self.assertFalse(mock_send.called)

    @patch('api.emails._send_async')
    def test_cancelling_does_not_email(self, mock_send):
        oid = self._place_order()
        mock_send.reset_mock()
        self._c(self.admin).patch(
            f'/api/admin/orders/{oid}/', {'status': 'cancelled'}, format='json')
        self.assertFalse(mock_send.called)
