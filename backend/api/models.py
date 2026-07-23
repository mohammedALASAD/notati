import re
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver


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
    phone      = models.CharField(max_length=20, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    # Brute-force protection: consecutive wrong-password attempts, and the time
    # until which login is locked after too many. Reset on a successful login or
    # a password reset. (See ThrottledLoginView.)
    failed_login_attempts = models.PositiveIntegerField(default=0)
    login_locked_until    = models.DateTimeField(null=True, blank=True)

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

    DEFAULT_RETENTION_DAYS = 45

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
    delete_after = models.DateTimeField(null=True, blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    def auto_delete_at(self):
        from datetime import timedelta
        return self.delete_after or (self.created_at + timedelta(days=self.DEFAULT_RETENTION_DAYS))

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


class Order(models.Model):
    STATUS_CHOICES = [
        ('pending',   'Pending payment'),
        ('paid',      'Paid'),
        ('cancelled', 'Cancelled'),
    ]

    user             = models.ForeignKey(User, on_delete=models.CASCADE, related_name='orders')
    code             = models.CharField(max_length=12, blank=True, db_index=True)  # short ref shared with the student
    status           = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    subtotal         = models.DecimalField(max_digits=8, decimal_places=3, default=0)  # before discount
    discount_code    = models.CharField(max_length=40, blank=True)
    discount_percent = models.PositiveIntegerField(default=0)
    total            = models.DecimalField(max_digits=8, decimal_places=3, default=0)  # after discount
    note             = models.CharField(max_length=300, blank=True)   # admin/payment reference
    created_at       = models.DateTimeField(auto_now_add=True)
    paid_at          = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Order #{self.pk} · {self.user.email} · {self.status}'


class OrderItem(models.Model):
    order          = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    # Keep the row even if the note is later deleted, so order history survives.
    note           = models.ForeignKey(Note, on_delete=models.SET_NULL, null=True, related_name='order_items')
    course_name    = models.CharField(max_length=200, blank=True)
    chapter_number = models.CharField(max_length=20, blank=True)
    chapter_title  = models.CharField(max_length=200, blank=True)
    price          = models.DecimalField(max_digits=6, decimal_places=3, default=0)

    def __str__(self):
        return f'{self.chapter_title} ({self.price})'


class DownloadLog(models.Model):
    """One row per note download / in-app read. The `code` is a per-(user, note)
    fingerprint embedded in the delivered PDF, so a leaked copy can be traced back
    to the student who downloaded it."""
    user       = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='downloads')
    note       = models.ForeignKey(Note, on_delete=models.SET_NULL, null=True, related_name='downloads')
    code       = models.CharField(max_length=32, db_index=True)
    ip         = models.CharField(max_length=45, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.code} · {self.user_id} · note {self.note_id}'


class VerificationCode(models.Model):
    """One-time code for email activation or password reset (5-minute TTL)."""
    PURPOSE_CHOICES = [('activate', 'Activate'), ('reset', 'Reset password')]

    user       = models.ForeignKey(User, on_delete=models.CASCADE, related_name='codes')
    purpose    = models.CharField(max_length=10, choices=PURPOSE_CHOICES)
    code_hash  = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    attempts   = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.user.email} · {self.purpose}'


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


class DiscountCode(models.Model):
    """A percentage discount an admin can hand out. Usable once per student,
    optionally bounded by a date window and a total-redemptions cap."""
    code        = models.CharField(max_length=40, unique=True)   # stored UPPERCASE
    percent     = models.PositiveIntegerField()                  # 1..100
    active      = models.BooleanField(default=True)
    valid_from  = models.DateTimeField(null=True, blank=True)    # null = no start bound
    valid_until = models.DateTimeField(null=True, blank=True)    # null = no end bound
    max_uses    = models.PositiveIntegerField(null=True, blank=True)  # null = unlimited
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.code} ({self.percent}%)'

    def uses_count(self):
        return self.redemptions.count()

    def reason_invalid(self, now):
        """Return None if usable right now, else a short human reason."""
        if not self.active:
            return 'This code is no longer active.'
        if self.valid_from and now < self.valid_from:
            return 'This code is not active yet.'
        if self.valid_until and now > self.valid_until:
            return 'This code has expired.'
        if self.max_uses is not None and self.uses_count() >= self.max_uses:
            return 'This code has reached its usage limit.'
        return None


class DiscountRedemption(models.Model):
    """Records that a student has used a code. One row per (code, user) enforces
    'once per student'. Tied to the order so it can be released if cancelled."""
    code       = models.ForeignKey(DiscountCode, on_delete=models.CASCADE, related_name='redemptions')
    user       = models.ForeignKey(User, on_delete=models.CASCADE, related_name='redemptions')
    order      = models.ForeignKey(Order, on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name='redemptions')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('code', 'user')

    def __str__(self):
        return f'{self.user.email} used {self.code.code}'


# ── Cloudinary cleanup signals ─────────────────────────────────────────────────

def _delete_cloudinary_file(file_field):
    """Delete a file from Cloudinary when its DB record is removed."""
    if not file_field:
        return
    try:
        url = file_field.url
    except Exception:
        return
    if 'res.cloudinary.com' not in url:
        return
    try:
        import cloudinary.uploader
        match = re.search(r'/raw/upload/(?:v\d+/)?(.+)$', url)
        if match:
            cloudinary.uploader.destroy(match.group(1), resource_type='raw')
    except Exception:
        pass


@receiver(post_delete, sender=NoteFile)
def _notefile_post_delete(sender, instance, **kwargs):
    _delete_cloudinary_file(instance.file)


@receiver(post_delete, sender=UploadFile)
def _uploadfile_post_delete(sender, instance, **kwargs):
    _delete_cloudinary_file(instance.file)


@receiver(post_delete, sender=Upload)
def _upload_post_delete(sender, instance, **kwargs):
    _delete_cloudinary_file(instance.file)
