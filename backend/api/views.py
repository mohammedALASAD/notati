import re
import time
import urllib.request
from rest_framework import generics, status, filters
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404
from django.db.models import Q
from django.db import transaction
from django.utils import timezone
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
def health(request):
    return JsonResponse({'status': 'ok'})
from .models import (
    User, Course, Note, NoteFile, Access, Upload, UploadFile,
    Testimonial, BagItem, Order, OrderItem,
)
from .serializers import (
    RegisterSerializer, UserSerializer, UserAdminSerializer,
    CourseSerializer, NoteSerializer, NoteAdminSerializer,
    NoteFileSerializer, UploadFileSerializer,
    AccessSerializer, UploadSerializer, UploadAdminSerializer,
    TestimonialSerializer, TestimonialAdminSerializer,
    BagItemSerializer, OrderSerializer,
)
from .permissions import IsAdmin, IsAdminOrReadOnly
from . import pdfutils, verification, emails


# ── Cloudinary proxy helper ───────────────────────────────────────────────────

def _fetch_file_bytes(file_field):
    """Fetch raw bytes for a file field (via Cloudinary Admin API, which bypasses
    CDN delivery blocks, or from local storage). Returns (content, content_type)."""
    url = file_field.url

    if 'res.cloudinary.com' in url:
        import cloudinary
        import cloudinary.utils
        from django.conf import settings as _s
        cs = getattr(_s, 'CLOUDINARY_STORAGE', {})
        if cs:
            cloudinary.config(
                cloud_name=cs.get('CLOUD_NAME', ''),
                api_key=cs.get('API_KEY', ''),
                api_secret=cs.get('API_SECRET', ''),
                secure=True,
            )
        match = re.search(r'/raw/upload/(?:v\d+/)?(.+)$', url)
        if not match:
            raise ValueError('Cannot parse Cloudinary URL: ' + url)
        # For raw resources the full path including extension IS the public_id
        public_id = match.group(1)   # e.g. media/uploads/file.pdf
        private_url = cloudinary.utils.private_download_url(
            public_id, '',
            resource_type='raw',
            type='upload',
            attachment=True,
            expires_at=int(time.time()) + 300,
        )
        req = urllib.request.Request(private_url, headers={'User-Agent': 'Notati/1.0'})
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read(), resp.headers.get('Content-Type', 'application/octet-stream')

    return file_field.read(), 'application/octet-stream'


def _proxy_file_response(file_field):
    """Return a file as a download response."""
    content, content_type = _fetch_file_bytes(file_field)
    filename = file_field.name.split('/')[-1]
    response = HttpResponse(content, content_type=content_type)
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


def _sample_response(file_field):
    """Return a teaser preview (first pages crisp, rest blurred), inline.
    Non-PDF files are refused (we can't render/blur them)."""
    content, _ = _fetch_file_bytes(file_field)
    if not pdfutils.is_pdf(content):
        return Response({'detail': 'Preview not available for this file type.'},
                        status=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE)
    sample = pdfutils.sample_pdf(content)
    response = HttpResponse(sample, content_type='application/pdf')
    response['Content-Disposition'] = 'inline; filename="sample.pdf"'
    return response


# ── Auth ──────────────────────────────────────────────────────────────────────

def _tokens_for(user):
    refresh = RefreshToken.for_user(user)
    return {'access': str(refresh.access_token), 'refresh': str(refresh)}


class ThrottledLoginView(TokenObtainPairView):
    """Login with per-IP rate limiting to slow brute-force / credential stuffing."""
    throttle_scope = 'login'


class RegisterView(APIView):
    """Create an INACTIVE account and email a 6-digit activation code.
    The account is unusable until verified, and is cleaned up if never activated."""
    permission_classes = [AllowAny]
    throttle_scope = 'register'

    def post(self, request):
        verification.cleanup_unverified()
        email = (request.data.get('email') or '').strip().lower()
        # Clear any prior unverified signup for this email so the user can retry.
        User.objects.filter(email__iexact=email, is_active=False).delete()
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        code = verification.issue_code(user, 'activate')
        emails.send_code_email(user, code, 'activate')
        return Response({'detail': 'Verification code sent.', 'email': user.email},
                        status=status.HTTP_201_CREATED)


class VerifyEmailView(APIView):
    """Activate an account with the emailed code, then log the user in."""
    permission_classes = [AllowAny]
    throttle_scope = 'verify'

    def post(self, request):
        email = (request.data.get('email') or '').strip().lower()
        code = (request.data.get('code') or '').strip()
        user = User.objects.filter(email__iexact=email, is_active=False).first()
        if not user:
            return Response(
                {'detail': 'No pending account for this email. It may have expired — please sign up again.'},
                status=status.HTTP_400_BAD_REQUEST)
        ok, msg = verification.check_code(user, 'activate', code)
        if not ok:
            return Response({'detail': msg}, status=status.HTTP_400_BAD_REQUEST)
        user.is_active = True
        user.save(update_fields=['is_active'])
        return Response(_tokens_for(user))


class ResendCodeView(APIView):
    """Re-issue an activation code for a pending account."""
    permission_classes = [AllowAny]
    throttle_scope = 'verify'

    def post(self, request):
        email = (request.data.get('email') or '').strip().lower()
        user = User.objects.filter(email__iexact=email, is_active=False).first()
        if user:
            code = verification.issue_code(user, 'activate')
            emails.send_code_email(user, code, 'activate')
        return Response({'detail': 'If the account is pending, a new code was sent.'})


class PasswordForgotView(APIView):
    """Email a password-reset code to an existing active account."""
    permission_classes = [AllowAny]
    throttle_scope = 'verify'

    def post(self, request):
        email = (request.data.get('email') or '').strip().lower()
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if user:
            code = verification.issue_code(user, 'reset')
            emails.send_code_email(user, code, 'reset')
        # Don't reveal whether the email exists.
        return Response({'detail': 'If an account exists, a reset code was sent.'})


class PasswordResetView(APIView):
    """Verify a reset code and set a new password, then log the user in."""
    permission_classes = [AllowAny]
    throttle_scope = 'verify'

    def post(self, request):
        email = (request.data.get('email') or '').strip().lower()
        code = (request.data.get('code') or '').strip()
        new_password = request.data.get('new_password') or ''
        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if not user:
            return Response({'detail': 'Invalid request.'}, status=status.HTTP_400_BAD_REQUEST)
        ok, msg = verification.check_code(user, 'reset', code)
        if not ok:
            return Response({'detail': msg}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(new_password, user)
        except DjangoValidationError as exc:
            return Response({'detail': ' '.join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(new_password)
        user.save(update_fields=['password'])
        return Response(_tokens_for(user))


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user


# ── Courses ───────────────────────────────────────────────────────────────────

class CourseListCreateView(generics.ListCreateAPIView):
    queryset = Course.objects.all()
    serializer_class = CourseSerializer
    permission_classes = [IsAdminOrReadOnly]
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'college']


class CourseDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Course.objects.all()
    serializer_class = CourseSerializer
    permission_classes = [IsAdminOrReadOnly]


# ── Notes ─────────────────────────────────────────────────────────────────────

class NoteListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['chapter_title', 'description', 'course__name']

    def get_queryset(self):
        qs = Note.objects.select_related('course').prefetch_related('files').all()
        course_id = self.request.query_params.get('course')
        if course_id:
            qs = qs.filter(course_id=course_id)
        return qs

    def get_serializer_class(self):
        if self.request.user.is_authenticated and self.request.user.role == 'admin':
            return NoteAdminSerializer
        return NoteSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAdmin()]
        return [AllowAny()]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class NoteDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Note.objects.select_related('course').prefetch_related('files').all()
    permission_classes = [IsAdminOrReadOnly]

    def get_serializer_class(self):
        if self.request.user.is_authenticated and self.request.user.role == 'admin':
            return NoteAdminSerializer
        return NoteSerializer


class NoteDownloadView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pk):
        note = get_object_or_404(Note, pk=pk)
        if not note.is_free:
            if not request.user.is_authenticated:
                return Response({'detail': 'Login required.'}, status=status.HTTP_401_UNAUTHORIZED)
            if request.user.role != 'admin':
                has_access = note.access_grants.filter(user=request.user).exists()
                if not has_access:
                    return Response({'detail': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)
        if not note.pdf_file:
            return Response({'detail': 'No file attached.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            return _proxy_file_response(note.pdf_file)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class UploadDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        upload = get_object_or_404(Upload, pk=pk)
        if request.user.role != 'admin' and upload.user != request.user:
            return Response({'detail': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)
        if not upload.file:
            return Response({'detail': 'No file attached.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            return _proxy_file_response(upload.file)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ── NoteFile ──────────────────────────────────────────────────────────────────

class NoteFileListCreateView(generics.ListCreateAPIView):
    serializer_class = NoteFileSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        qs = NoteFile.objects.select_related('note__course').all()
        note_id = self.request.query_params.get('note')
        if note_id:
            qs = qs.filter(note_id=note_id)
        # Students only see files for free notes or notes they've been granted.
        if not (user.is_authenticated and user.role == 'admin'):
            qs = qs.filter(
                Q(note__price=0) | Q(note__access_grants__user=user)
            ).distinct()
        return qs


class NoteFileDetailView(generics.RetrieveDestroyAPIView):
    queryset = NoteFile.objects.all()
    serializer_class = NoteFileSerializer
    permission_classes = [IsAdmin]


class NoteFileDownloadView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pk):
        nf = get_object_or_404(NoteFile, pk=pk)
        note = nf.note
        if not note.is_free:
            if not request.user.is_authenticated:
                return Response({'detail': 'Login required.'}, status=status.HTTP_401_UNAUTHORIZED)
            if request.user.role != 'admin':
                if not note.access_grants.filter(user=request.user).exists():
                    return Response({'detail': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)
        if not nf.file:
            return Response({'detail': 'No file attached.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            return _proxy_file_response(nf.file)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class NoteFileSampleView(APIView):
    """First couple of pages of a note file as a watermarked sample — open to all
    so prospective buyers can judge quality before purchasing."""
    permission_classes = [AllowAny]
    throttle_scope = 'sample'

    def get(self, request, pk):
        nf = get_object_or_404(NoteFile, pk=pk)
        if not nf.file:
            return Response({'detail': 'No file attached.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            return _sample_response(nf.file)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class NoteSampleView(APIView):
    """Sample preview for a legacy single-file note (note.pdf_file)."""
    permission_classes = [AllowAny]
    throttle_scope = 'sample'

    def get(self, request, pk):
        note = get_object_or_404(Note, pk=pk)
        if not note.pdf_file:
            return Response({'detail': 'No file attached.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            return _sample_response(note.pdf_file)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ── UploadFile ────────────────────────────────────────────────────────────────

class UploadFileListCreateView(generics.ListCreateAPIView):
    serializer_class = UploadFileSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = UploadFile.objects.select_related('upload').all()
        if user.role != 'admin':
            qs = qs.filter(upload__user=user)
        upload_id = self.request.query_params.get('upload')
        if upload_id:
            qs = qs.filter(upload_id=upload_id)
        return qs


class UploadFileDetailView(generics.RetrieveDestroyAPIView):
    serializer_class = UploadFileSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'admin':
            return UploadFile.objects.all()
        return UploadFile.objects.filter(upload__user=user)


class UploadFileDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        uf = get_object_or_404(UploadFile, pk=pk)
        if request.user.role != 'admin' and uf.upload.user != request.user:
            return Response({'detail': 'Access denied.'}, status=status.HTTP_403_FORBIDDEN)
        if not uf.file:
            return Response({'detail': 'No file attached.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            return _proxy_file_response(uf.file)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ── Access ────────────────────────────────────────────────────────────────────

class AccessListCreateView(generics.ListCreateAPIView):
    serializer_class = AccessSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'admin':
            qs = Access.objects.select_related('user', 'note__course', 'granted_by').all()
            student_id = self.request.query_params.get('user')
            if student_id:
                qs = qs.filter(user_id=student_id)
            note_id = self.request.query_params.get('note')
            if note_id:
                qs = qs.filter(note_id=note_id)
            return qs
        return Access.objects.filter(user=user).select_related('note__course')


class AccessDetailView(generics.RetrieveDestroyAPIView):
    queryset = Access.objects.all()
    serializer_class = AccessSerializer
    permission_classes = [IsAdmin]


# ── Uploads ───────────────────────────────────────────────────────────────────

class UploadListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'admin':
            return Upload.objects.select_related('user').all()
        return Upload.objects.filter(user=user)

    def get_serializer_class(self):
        if self.request.user.role == 'admin':
            return UploadAdminSerializer
        return UploadSerializer


class UploadDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'admin':
            return Upload.objects.all()
        return Upload.objects.filter(user=user)

    def get_serializer_class(self):
        if self.request.user.role == 'admin':
            return UploadAdminSerializer
        return UploadSerializer


# ── Admin: Users ──────────────────────────────────────────────────────────────

class AdminUserListView(generics.ListAPIView):
    queryset = User.objects.all().order_by('name')
    serializer_class = UserAdminSerializer
    permission_classes = [IsAdmin]
    filter_backends = [filters.SearchFilter]
    search_fields = ['email', 'name', 'college']


class AdminUserDetailView(generics.RetrieveUpdateAPIView):
    queryset = User.objects.all()
    serializer_class = UserAdminSerializer
    permission_classes = [IsAdmin]


# ── Stats (admin dashboard) ───────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAdmin])
def admin_stats(request):
    return Response({
        'students': User.objects.filter(role='student').count(),
        'notes':    Note.objects.count(),
        'courses':  Course.objects.count(),
        'uploads':  Upload.objects.filter(status='pending').count(),
        'accesses': Access.objects.count(),
    })


@api_view(['GET'])
@permission_classes([IsAdmin])
def admin_chapter_rankings(request):
    from django.db.models import Count
    notes = (
        Note.objects.select_related('course')
        .annotate(access_count=Count('access_grants'))
        .filter(access_count__gt=0)
        .order_by('-access_count')[:20]
    )
    data = [
        {
            'id': n.id,
            'chapter_number': n.chapter_number,
            'chapter_title': n.chapter_title,
            'course_name': n.course.name,
            'college': n.course.college,
            'price': str(n.price),
            'access_count': n.access_count,
        }
        for n in notes
    ]
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAdmin])
def admin_sales(request):
    from django.db.models import Count
    notes = (
        Note.objects.select_related('course')
        .filter(price__gt=0)
        .annotate(sales=Count('access_grants'))
        .filter(sales__gt=0)
        .order_by('course__college', 'course__name', 'chapter_number')
    )
    rows = []
    total_revenue = 0.0
    total_sales = 0
    for n in notes:
        revenue = float(n.price) * n.sales
        total_revenue += revenue
        total_sales += n.sales
        rows.append({
            'id': n.id,
            'college': n.course.college,
            'course_name': n.course.name,
            'chapter_number': n.chapter_number,
            'chapter_title': n.chapter_title,
            'price': str(n.price),
            'sales': n.sales,
            'revenue': f'{revenue:.3f}',
        })
    return Response({
        'total_revenue': f'{total_revenue:.3f}',
        'total_sales': total_sales,
        'rows': rows,
    })


# ── Testimonials ──────────────────────────────────────────────────────────────

class TestimonialPublicView(generics.ListAPIView):
    serializer_class   = TestimonialSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        return Testimonial.objects.filter(approved=True)


class TestimonialCreateView(generics.CreateAPIView):
    serializer_class   = TestimonialSerializer
    permission_classes = [IsAuthenticated]


class TestimonialAdminListView(generics.ListAPIView):
    serializer_class   = TestimonialAdminSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        return Testimonial.objects.all()


class TestimonialAdminDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class   = TestimonialAdminSerializer
    permission_classes = [IsAdmin]
    queryset           = Testimonial.objects.all()


# ── Bag ───────────────────────────────────────────────────────────────────────

class BagView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        items = BagItem.objects.filter(user=request.user).select_related('note__course')
        return Response(BagItemSerializer(items, many=True).data)

    def post(self, request):
        note_id = request.data.get('note_id')
        if not note_id:
            return Response({'detail': 'note_id required.'}, status=status.HTTP_400_BAD_REQUEST)
        note = get_object_or_404(Note, pk=note_id)
        item, _ = BagItem.objects.get_or_create(user=request.user, note=note)
        return Response(BagItemSerializer(item).data, status=status.HTTP_201_CREATED)

    def delete(self, request):
        note_id = request.data.get('note_id')
        if not note_id:
            return Response({'detail': 'note_id required.'}, status=status.HTTP_400_BAD_REQUEST)
        BagItem.objects.filter(user=request.user, note_id=note_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class BagClearView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        BagItem.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Orders ────────────────────────────────────────────────────────────────────

class OrderListCreateView(generics.ListCreateAPIView):
    """Students place an order from their bag and see their own order history."""
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Order.objects.filter(user=self.request.user).prefetch_related('items')

    def create(self, request, *args, **kwargs):
        # Prefer note_ids sent by the client (the bag the user actually sees);
        # fall back to the server-side bag. This avoids depending on perfect
        # bag sync to record an order.
        note_ids = request.data.get('note_ids')
        if note_ids:
            notes = list(Note.objects.filter(pk__in=note_ids).select_related('course'))
        else:
            notes = [b.note for b in
                     BagItem.objects.filter(user=request.user).select_related('note__course')]
        if not notes:
            return Response({'detail': 'No items to order.'}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            order = Order.objects.create(user=request.user, status='pending')
            total = 0
            for n in notes:
                OrderItem.objects.create(
                    order=order, note=n,
                    course_name=n.course.name if n.course else '',
                    chapter_number=str(n.chapter_number),
                    chapter_title=n.chapter_title,
                    price=n.price,
                )
                total += n.price
            order.total = total
            order.save(update_fields=['total'])
            # The bag has become an order — clear it.
            BagItem.objects.filter(user=request.user).delete()
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)


class AdminOrderListView(generics.ListAPIView):
    serializer_class = OrderSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        qs = Order.objects.select_related('user').prefetch_related('items')
        st = self.request.query_params.get('status')
        if st:
            qs = qs.filter(status=st)
        return qs


class AdminOrderDetailView(APIView):
    """Admin updates an order's status. Marking it 'paid' grants access to every
    note in the order in one step (idempotent)."""
    permission_classes = [IsAdmin]

    def patch(self, request, pk):
        order = get_object_or_404(Order, pk=pk)
        new_status = request.data.get('status')
        ref = request.data.get('note')
        if ref is not None:
            order.note = ref

        if new_status == 'paid' and order.status != 'paid':
            with transaction.atomic():
                for item in order.items.all():
                    if item.note_id:
                        Access.objects.get_or_create(
                            user=order.user, note_id=item.note_id,
                            defaults={'granted_by': request.user},
                        )
                order.status = 'paid'
                order.paid_at = timezone.now()
                order.save()
        elif new_status in ('pending', 'cancelled'):
            order.status = new_status
            order.save()
        else:
            order.save()

        return Response(OrderSerializer(order).data)


# ── Admin: Send support email ─────────────────────────────────────────────────

class AdminSendEmailView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request):
        user_id = request.data.get('user_id')
        subject = (request.data.get('subject') or '').strip()
        message = (request.data.get('message') or '').strip()

        if not user_id or not subject or not message:
            return Response({'detail': 'user_id, subject and message are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            recipient = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

        from .emails import send_support_email
        send_support_email(recipient.email, recipient.name, subject, message)
        return Response({'detail': 'Email sent.'})
