from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from . import views

urlpatterns = [
    # Auth
    path('auth/register/',      views.RegisterView.as_view(),      name='register'),
    path('auth/login/',         TokenObtainPairView.as_view(),     name='login'),
    path('auth/token/refresh/', TokenRefreshView.as_view(),        name='token-refresh'),
    path('auth/me/',            views.MeView.as_view(),            name='me'),

    # Courses
    path('courses/',            views.CourseListCreateView.as_view(), name='course-list'),
    path('courses/<int:pk>/',   views.CourseDetailView.as_view(),     name='course-detail'),

    # Notes
    path('notes/',              views.NoteListCreateView.as_view(),   name='note-list'),
    path('notes/<int:pk>/',     views.NoteDetailView.as_view(),       name='note-detail'),
    path('notes/<int:pk>/download/', views.NoteDownloadView.as_view(), name='note-download'),

    # Access
    path('access/',             views.AccessListCreateView.as_view(), name='access-list'),
    path('access/<int:pk>/',    views.AccessDetailView.as_view(),     name='access-detail'),

    # Uploads
    path('uploads/',                        views.UploadListCreateView.as_view(),  name='upload-list'),
    path('uploads/<int:pk>/',               views.UploadDetailView.as_view(),      name='upload-detail'),
    path('uploads/<int:pk>/download/',      views.UploadDownloadView.as_view(),    name='upload-download'),

    # Admin
    path('admin/users/',        views.AdminUserListView.as_view(),    name='admin-users'),
    path('admin/users/<int:pk>/', views.AdminUserDetailView.as_view(), name='admin-user-detail'),
    path('admin/stats/',        views.admin_stats,                    name='admin-stats'),

    # Testimonials
    path('testimonials/',              views.TestimonialPublicView.as_view(),       name='testimonial-list'),
    path('testimonials/submit/',       views.TestimonialCreateView.as_view(),       name='testimonial-submit'),
    path('admin/testimonials/',        views.TestimonialAdminListView.as_view(),    name='admin-testimonial-list'),
    path('admin/testimonials/<int:pk>/', views.TestimonialAdminDetailView.as_view(), name='admin-testimonial-detail'),
]
