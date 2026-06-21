from decimal import Decimal
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from pypdf import PdfReader
from reportlab.pdfgen import canvas
from rest_framework.test import APIClient, APIRequestFactory, force_authenticate

from . import pdfutils
from .models import User, Course, Note, NoteFile, Access
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
        s = RegisterSerializer(data={'email': 'a@b.com', 'name': 'A', 'password': 'Tr0ub4dour!'})
        self.assertTrue(s.is_valid(), s.errors)


class PdfUtilsTests(TestCase):
    def test_watermark_preserves_pages_and_stamps_email(self):
        out = pdfutils.watermark_for_user(_make_pdf(3), 'buyer@x.com')
        self.assertEqual(len(PdfReader(BytesIO(out)).pages), 3)
        self.assertIn('buyer@x.com', _page_text(out))

    def test_sample_truncates_and_stamps(self):
        out = pdfutils.sample_pdf(_make_pdf(10), pages=2)
        self.assertEqual(len(PdfReader(BytesIO(out)).pages), 2)
        self.assertIn('SAMPLE', _page_text(out))

    def test_non_pdf_passes_through_untouched(self):
        self.assertEqual(pdfutils.watermark_for_user(b'not a pdf', 'x@y.com'), b'not a pdf')


class SampleAndWatermarkEndpointTests(TestCase):
    def setUp(self):
        self.course = Course.objects.create(name='ITIS103')
        self.note = Note.objects.create(
            course=self.course, chapter_number=1,
            chapter_title='Paid', price=Decimal('2.000'),
        )
        self.nf = NoteFile.objects.create(
            note=self.note, file=SimpleUploadedFile('f.pdf', _make_pdf(6)),
        )
        self.buyer = User.objects.create_user('buyer@x.com', 'pw', name='Buyer')
        Access.objects.create(user=self.buyer, note=self.note)

    def test_sample_is_public_and_truncated(self):
        resp = APIClient().get(f'/api/note-files/{self.nf.id}/sample/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp['Content-Type'], 'application/pdf')
        self.assertEqual(len(PdfReader(BytesIO(resp.content)).pages), 2)

    def test_buyer_download_is_watermarked_with_email(self):
        client = APIClient()
        client.force_authenticate(self.buyer)
        resp = client.get(f'/api/note-files/{self.nf.id}/download/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(PdfReader(BytesIO(resp.content)).pages), 6)
        self.assertIn('buyer@x.com', _page_text(resp.content))
