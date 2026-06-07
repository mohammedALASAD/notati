import re
import time
import urllib.request
from rest_framework import generics, status, filters
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.http import HttpResponse
from django.shortcuts import get_object_or_404

from .models import User, Course, Note, Access, Upload
from .serializers import (
    RegisterSerializer, UserSerializer, UserAdminSerializer,
    CourseSerializer, NoteSerializer, NoteAdminSerializer,
    AccessSerializer, UploadSerializer, UploadAdminSerializer,
)
from .permissions import IsAdmin, IsAdminOrReadOnly


# ── Cloudinary proxy helper ───────────────────────────────────────────────────

def _proxy_file_response(file_field):
    """Fetch a file via Cloudinary Admin API (bypasses CDN delivery blocks) and return as HttpResponse."""
    url = file_field.url
    filename = file_field.name.split('/')[-1]

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
            content = resp.read()
            content_type = resp.headers.get('Content-Type', 'application/octet-stream')
    else:
        content = file_field.read()
        content_type = 'application/octet-stream'

    response = HttpResponse(content, content_type=content_type)
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


# ── Auth ──────────────────────────────────────────────────────────────────────

class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]


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
        qs = Note.objects.select_related('course').all()
        course_id = self.request.query_params.get('course')
        if course_id:
            qs = qs.filter(course_id=course_id)
        return qs

    def get_serializer_class(self):
        if self.request.user.role == 'admin':
            return NoteAdminSerializer
        return NoteSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAdmin()]
        return [IsAuthenticated()]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class NoteDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Note.objects.select_related('course').all()
    permission_classes = [IsAdminOrReadOnly]

    def get_serializer_class(self):
        if self.request.user.role == 'admin':
            return NoteAdminSerializer
        return NoteSerializer


class NoteDownloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        note = get_object_or_404(Note, pk=pk)
        if not note.is_free and request.user.role != 'admin':
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
