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


class NoteFile(models.Model):
    note    = models.ForeignKey(Note, on_delete=models.CASCADE, related_name='files')
    label   = models.CharField(max_length=200, blank=True, default='')
    file    = models.FileField(upload_to='note_files/')
    order   = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'created_at']

    def __str__(self):
        return f'{self.note} – {self.label or "file"}'


class Upload(models.Model):
    STATUS_CHOICES = [
        ('pending',  'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]

    user           = models.ForeignKey(User, on_delete=models.CASCADE, related_name='uploads')
    file           = models.FileField(upload_to='uploads/', blank=True, null=True)
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


class UploadFile(models.Model):
    upload  = models.ForeignKey(Upload, on_delete=models.CASCADE, related_name='files')
    label   = models.CharField(max_length=200, blank=True, default='')
    file    = models.FileField(upload_to='upload_files/')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f'{self.upload} – {self.label or "file"}'


class BagItem(models.Model):
    user       = models.ForeignKey(User, on_delete=models.CASCADE, related_name='bag_items')
    note       = models.ForeignKey(Note, on_delete=models.CASCADE, related_name='bag_items')
    added_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('user', 'note')]
        ordering = ['added_at']

    def __str__(self):
        return f'{self.user.email} bag: {self.note}'


class Testimonial(models.Model):
    user       = models.ForeignKey(User, on_delete=models.CASCADE, related_name='testimonials')
    text       = models.TextField(max_length=300)
    course     = models.CharField(max_length=200, blank=True)
    approved   = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.user.name}: {self.text[:50]}'
