"""One-time verification codes for email activation and password reset.

Codes are 6-digit, hashed at rest, expire after 5 minutes, and allow a
limited number of guesses. Unverified student accounts are cleaned up lazily
(no scheduler needed) — an account with no still-valid activation code is
removed on the next auth activity.
"""
import random
from datetime import timedelta

from django.contrib.auth.hashers import check_password, make_password
from django.utils import timezone

from .models import User, VerificationCode

CODE_TTL_MINUTES = 5
MAX_ATTEMPTS = 5


def generate_code():
    return f'{random.randint(0, 999999):06d}'


def issue_code(user, purpose):
    """Replace any existing code for (user, purpose) and return the plaintext code."""
    VerificationCode.objects.filter(user=user, purpose=purpose).delete()
    code = generate_code()
    VerificationCode.objects.create(
        user=user,
        purpose=purpose,
        code_hash=make_password(code),
        expires_at=timezone.now() + timedelta(minutes=CODE_TTL_MINUTES),
    )
    return code


def check_code(user, purpose, code):
    """Validate a submitted code. Returns (ok, error_message)."""
    vc = (VerificationCode.objects
          .filter(user=user, purpose=purpose)
          .order_by('-created_at')
          .first())
    if not vc:
        return False, 'No code found. Please request a new one.'
    if vc.expires_at < timezone.now():
        vc.delete()
        return False, 'This code has expired. Please request a new one.'
    if vc.attempts >= MAX_ATTEMPTS:
        vc.delete()
        return False, 'Too many attempts. Please request a new code.'
    if not check_password(code, vc.code_hash):
        vc.attempts += 1
        vc.save(update_fields=['attempts'])
        return False, 'Incorrect code. Please try again.'
    vc.delete()
    return True, ''


def cleanup_unverified():
    """Delete inactive student accounts that no longer hold a valid activation code."""
    now = timezone.now()
    (User.objects
        .filter(is_active=False, role='student')
        .exclude(codes__purpose='activate', codes__expires_at__gte=now)
        .delete())
