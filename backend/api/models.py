import re
from decimal import Decimal, ROUND_HALF_UP
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver
from django.utils import timezone


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
    # When this student last said "not now" to the review prompt. Compared
    # against their newest paid order, so saying no puts it away for that
    # purchase but a later one asks again.
    review_prompt_dismissed_at = models.DateTimeField(null=True, blank=True)

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
    # When this chapter was last changed — a new file, a corrected title, a
    # price. `created_at` only ever says when it was first published, which is
    # no help in answering "what did I touch last?". Null only on rows written
    # before this field existed; the backfill dated those from their newest file.
    updated_at     = models.DateTimeField(auto_now=True, null=True)

    class Meta:
        ordering = ['course', 'chapter_number']
        unique_together = [('course', 'chapter_number')]

    @property
    def last_changed(self):
        """The best answer available for 'when did this last change' — the stamp
        if there is one, else the day it was published."""
        return self.updated_at or self.created_at

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
    # Which term this unlock belongs to. Stamped on creation like Order.semester,
    # so hand-granted access shows up in the right column of the sales record.
    semester   = models.ForeignKey(
        'Semester', on_delete=models.SET_NULL, null=True, blank=True, related_name='access_grants'
    )
    # What this copy was worth the moment it went out — the net price paid if it
    # came from an order, the list price at the time if unlocked by hand. Frozen
    # here so a later price change never revalues a sale already made. Null only
    # on rows from before this field existed; those fall back to today's price.
    price      = models.DecimalField(max_digits=6, decimal_places=3, null=True, blank=True)
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


class Semester(models.Model):
    """The term a sale belongs to — the way the sales record has always been
    organised. Deliberately a label, not a date range: the admin keeps the
    numbering and there is no calendar to maintain.

    `starts_on` is optional, and only a safety net. Setting it on the next
    semester means the switch happens on its own on that day, so forgetting to
    flip it manually can't misfile a week of sales. Leave it blank to stay
    entirely manual."""

    label      = models.CharField(max_length=60, unique=True)   # 'Semester 11'
    position   = models.PositiveIntegerField(unique=True)       # sort + succession order
    is_summer  = models.BooleanField(default=False)
    starts_on  = models.DateField(null=True, blank=True)
    is_current = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['position']

    def __str__(self):
        return self.label

    @classmethod
    def current(cls):
        """The semester new sales file under.

        Advances by itself if a later semester's start date has arrived, so the
        answer is right even if nobody flipped the switch. Returns None only
        when no semesters exist at all."""
        today = timezone.localdate()
        cur = cls.objects.filter(is_current=True).first()
        due = (cls.objects
               .filter(starts_on__isnull=False, starts_on__lte=today)
               .order_by('-position').first())
        if due and (cur is None or due.position > cur.position):
            cls.objects.filter(is_current=True).update(is_current=False)
            cls.objects.filter(pk=due.pk).update(is_current=True)
            due.is_current = True
            return due
        return cur or cls.objects.order_by('-position').first()

    def make_current(self):
        """Switch to this semester, clearing whichever one held it before."""
        type(self).objects.filter(is_current=True).exclude(pk=self.pk).update(is_current=False)
        if not self.is_current:
            self.is_current = True
            self.save(update_fields=['is_current'])
        return self


class Order(models.Model):
    STATUS_CHOICES = [
        ('pending',   'Pending payment'),
        ('paid',      'Paid'),
        ('cancelled', 'Cancelled'),
    ]

    user             = models.ForeignKey(User, on_delete=models.CASCADE, related_name='orders')
    # Stamped once, when the order is placed, and never moved afterwards — so the
    # sales record for a closed term can't shift under you later.
    semester         = models.ForeignKey(
        Semester, on_delete=models.SET_NULL, null=True, blank=True, related_name='orders'
    )
    code             = models.CharField(max_length=12, blank=True, db_index=True)  # short ref shared with the student
    status           = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    subtotal         = models.DecimalField(max_digits=8, decimal_places=3, default=0)  # before discount
    discount_code    = models.CharField(max_length=40, blank=True)
    discount_percent = models.PositiveIntegerField(default=0)
    # Money actually taken off. The percent alone can't express a flat 'BD 1 off'
    # code, and every per-chapter figure downstream is derived from this, so it
    # is the authoritative number. Backfilled from the percent for older orders.
    discount_amount  = models.DecimalField(max_digits=8, decimal_places=3, default=0)
    total            = models.DecimalField(max_digits=8, decimal_places=3, default=0)  # after discount
    note             = models.CharField(max_length=300, blank=True)   # admin/payment reference
    created_at       = models.DateTimeField(auto_now_add=True)
    paid_at          = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Order #{self.pk} · {self.user.email} · {self.status}'

    def line_nets(self):
        """{OrderItem id: what that chapter actually cost}, discount included."""
        return _order_line_nets(self, self.items.all().order_by('pk'))


def _order_line_nets(order, items):
    """What each line of an order actually cost once the discount is spread
    across it, in proportion to its price.

    One function so the receipt, the access price frozen at confirmation, the
    Insights revenue and the sales workbook can never disagree. Rounding is
    settled by giving the last line whatever is left, so the lines add up to
    the order total exactly rather than drifting a fils apart from it."""
    items = list(items)
    subtotal = sum((i.price or Decimal('0')) for i in items)
    off = Decimal(order.discount_amount or 0)
    if off <= 0 and order.discount_percent:
        # An order placed before discount_amount existed: derive it from the
        # percent, the only record those rows kept.
        off = (subtotal * Decimal(order.discount_percent) / Decimal(100)).quantize(
            Decimal('0.001'), rounding=ROUND_HALF_UP)
    off = min(max(off, Decimal('0')), subtotal)
    if not items or subtotal <= 0 or off <= 0:
        return {i.pk: (i.price or Decimal('0')) for i in items}

    nets, spent = {}, Decimal('0')
    for i in items[:-1]:
        share = ((i.price or Decimal('0')) * off / subtotal).quantize(
            Decimal('0.001'), rounding=ROUND_HALF_UP)
        nets[i.pk] = (i.price or Decimal('0')) - share
        spent += share
    last = items[-1]
    nets[last.pk] = (last.price or Decimal('0')) - (off - spent)
    return nets


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
    to the student who downloaded it.

    A row is also written when someone looks at a chapter's blurred sample —
    `kind` tells the two apart. A preview is not an open (the student never got
    the chapter), but it is the only thing a student can do with a paid chapter
    before buying it, so Insights counts them on their own."""
    KIND_CHOICES = [('open', 'Open'), ('preview', 'Preview')]

    user       = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='downloads')
    note       = models.ForeignKey(Note, on_delete=models.SET_NULL, null=True, related_name='downloads')
    kind       = models.CharField(max_length=8, choices=KIND_CHOICES, default='open', db_index=True)
    # The term the open happened in, so Insights can be read one semester at a
    # time. Stamped when the row is written, like Order.semester.
    semester   = models.ForeignKey('Semester', on_delete=models.SET_NULL, null=True,
                                   blank=True, related_name='downloads')
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


def _course_key(name):
    """The bare course code, so 'ITIS103' on a review lines up with the
    catalogue's 'ITIS103 / ITIS104'. Same folding the sales record uses."""
    head = re.split(r'[/(]', name or '', maxsplit=1)[0]
    return head.strip().upper().replace(' ', '') or (name or '').strip().upper()


class Testimonial(models.Model):
    """A student's review. Written by them, shown publicly only once an admin
    approves it — on the landing page and against the course it names."""
    FULL, FIRST, ANON = 'full', 'first', 'anonymous'
    NAME_CHOICES = [(FULL, 'Full name'), (FIRST, 'First name only'),
                    (ANON, 'No name')]

    user       = models.ForeignKey(User, on_delete=models.CASCADE, related_name='testimonials')
    text       = models.TextField(max_length=300)
    course     = models.CharField(max_length=200, blank=True)
    rating     = models.PositiveSmallIntegerField(null=True, blank=True)   # 1..5
    # How the student wants to be credited. Their name and college go on the
    # open internet when this is approved, so it is their call, not ours.
    name_style = models.CharField(max_length=10, choices=NAME_CHOICES, default=FULL)
    approved   = models.BooleanField(default=False)
    # Pinned to the front wherever reviews are shown, so the best ones lead.
    featured   = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.user.name}: {self.text[:50]}'

    @property
    def display_name(self):
        """What the public sees — never more than the student agreed to."""
        name = (self.user.name or '').strip()
        if self.name_style == self.ANON or not name:
            return 'A Notati student'
        if self.name_style == self.FIRST:
            return name.split()[0]
        return name

    def is_verified_buyer(self):
        """Whether this student has actually paid for a chapter of the course
        they are reviewing — the difference between a review and a claim.

        Falls back to 'has bought anything at all' when the review names no
        course, and never guesses: no purchase, no badge."""
        grants = Access.objects.filter(user=self.user, note__price__gt=0)
        if not self.course:
            return grants.exists()
        key = _course_key(self.course)
        for name in (grants.values_list('note__course__name', flat=True).distinct()):
            if _course_key(name) == key:
                return True
        return False


class DiscountCode(models.Model):
    """A discount an admin can hand out — a percentage off, or a flat sum in
    dinars. Usable once per student, optionally bounded by a date window, a
    total-redemptions cap, a minimum spend, and a list of students it is for."""
    PERCENT, AMOUNT = 'percent', 'amount'
    KIND_CHOICES = [(PERCENT, 'Percentage off'), (AMOUNT, 'Fixed amount off')]

    code        = models.CharField(max_length=40, unique=True)   # stored UPPERCASE
    kind        = models.CharField(max_length=8, choices=KIND_CHOICES, default=PERCENT)
    percent     = models.PositiveIntegerField(default=0)         # 1..100, when kind=percent
    amount      = models.DecimalField(max_digits=8, decimal_places=3, default=0)  # BD, when kind=amount
    # Smallest order this code works on, measured on the subtotal before any
    # discount. Null = no minimum. 'Spend 5 BD and get the code' lives here.
    min_subtotal = models.DecimalField(max_digits=8, decimal_places=3, null=True, blank=True)
    # Lowercased emails this code is reserved for. Empty = open to every student.
    # Held as a list rather than a table of rows: it is edited as one field, read
    # as a whole, and an email need not belong to an account that exists yet.
    allowed_emails = models.JSONField(default=list, blank=True)
    active      = models.BooleanField(default=True)
    valid_from  = models.DateTimeField(null=True, blank=True)    # null = no start bound
    valid_until = models.DateTimeField(null=True, blank=True)    # null = no end bound
    max_uses    = models.PositiveIntegerField(null=True, blank=True)  # null = unlimited
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.code} ({self.label})'

    @property
    def label(self):
        """How the discount reads to a person: '10% off' or 'BD 1.500 off'."""
        if self.kind == self.AMOUNT:
            return f'BD {self.amount:.3f} off'
        return f'{self.percent}% off'

    def uses_count(self):
        return self.redemptions.count()

    def discount_for(self, subtotal):
        """Money off a given subtotal.

        Never more than the subtotal itself: a BD 5 code on a BD 3 basket takes
        the basket to zero, it does not hand out BD 2 of credit."""
        subtotal = Decimal(subtotal or 0)
        if self.kind == self.AMOUNT:
            off = Decimal(self.amount or 0)
        else:
            off = (subtotal * Decimal(self.percent or 0) / Decimal(100)).quantize(
                Decimal('0.001'), rounding=ROUND_HALF_UP)
        return min(max(off, Decimal('0')), max(subtotal, Decimal('0')))

    def allows(self, user):
        """Whether this student is one the code was made for."""
        if not self.allowed_emails:
            return True
        email = (getattr(user, 'email', '') or '').strip().lower()
        return bool(email) and email in self.allowed_emails

    def reason_invalid(self, now, user=None, subtotal=None):
        """Return None if usable right now, else a short human reason.

        `user` and `subtotal` are optional so a caller with neither still gets
        the time and cap checks — but a code reserved for named students, or
        with a minimum spend, can only be fully judged with them."""
        if not self.active:
            return 'This code is no longer active.'
        if self.valid_from and now < self.valid_from:
            return 'This code is not active yet.'
        if self.valid_until and now > self.valid_until:
            return 'This code has expired.'
        if self.max_uses is not None and self.uses_count() >= self.max_uses:
            return 'This code has reached its usage limit.'
        if user is not None and not self.allows(user):
            return 'This code is not available on your account.'
        if self.min_subtotal and subtotal is not None and Decimal(subtotal) < self.min_subtotal:
            return (f'Spend at least BD {self.min_subtotal:.3f} to use this code '
                    f'(your basket is BD {Decimal(subtotal):.3f}).')
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
