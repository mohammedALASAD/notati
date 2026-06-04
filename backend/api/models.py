from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra):
        if not email:
            raise ValueError('Email is required')
        user = self.model(email=self.normalize_email(email), **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra):
        extra.setdefault('role', 'admin')
        extra.setdefault('is_staff', True)
        extra.setdefault('is_superuser', True)
        return self.create_user(email, password, **extra)


class User(AbstractUser):
    ROLE_CHOICES = [('admin', 'Admin'), ('student', 'Student')]

    username   = None
    email      = models.EmailField(unique=True)
    name       = models.CharField(max_length=120)
    role       = models.CharField(max_length=10, choices=ROLE_CHOICES, default='student')
    college    = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    USERNAME_FIELD  = 'email'
    REQUIRED_FIELDS = ['name']

    objects = UserManager()

    def __str__(self):
        return self.email


class Course(models.Model):
    name       = models.CharField(max_length=200, unique=True)
    college    = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Note(models.Model):
    course         = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='notes')
    chapter_number = models.PositiveIntegerField()
    chapter_title  = models.CharField(max_length=200)
    description    = models.TextField(blank=True)
    price          = models.DecimalField(max_digits=6, decimal_places=3, default=0)
    pdf_file       = models.FileField(upload_to='notes/', blank=True, null=True)
    created_by     = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name='published_notes'
    )
    created_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['course', 'chapter_number']
        unique_together = [('course', 'chapter_number')]

    @property
    def is_free(self):
        return self.price == 0

    def __str__(self):
        return f'{self.course.name} Ch.{self.chapter_number}: {self.chapter_title}'


class Access(models.Model):
    user       = models.ForeignKey(User, on_delete=models.CASCADE, related_name='access_grants')
    note       = models.ForeignKey(Note, on_delete=models.CASCADE, related_name='access_grants')
    granted_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name='access_given'
    )
    granted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('user', 'note')]

    def __str__(self):
        return f'{self.user.email} -> {self.note}'


class Upload(models.Model):
    STATUS_CHOICES = [
        ('pending',  'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]

    user           = models.ForeignKey(User, on_delete=models.CASCADE, related_name='uploads')
    file           = models.FileField(upload_to='uploads/')
    title          = models.CharField(max_length=200)
    description    = models.TextField(blank=True)
    college        = models.CharField(max_length=120, blank=True)
    course_name    = models.CharField(max_length=200, blank=True)
    chapter_number = models.CharField(max_length=20, blank=True)
    chapter_title  = models.CharField(max_length=200, blank=True)
    status         = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    note        = models.ForeignKey(
        Note, on_delete=models.SET_NULL, null=True, blank=True, related_name='source_upload'
    )
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.user.email}: {self.title}'
