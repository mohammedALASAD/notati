"""Direct download links.

A student's Download button used to fetch the file in JavaScript and then hand
the browser a blob to save. That works on a desktop and fails quietly almost
everywhere a student actually is: iOS Safari tends to open the blob instead of
saving it, and the browsers inside Instagram and WhatsApp cannot save it at
all. A plain link the browser navigates to, answered with
Content-Disposition: attachment, downloads on every one of them.

A plain link cannot carry the login header, so it carries a signed, expiring
token bound to the student and the file instead. Same access check, same
fingerprint, same log row — only the way the request is authenticated differs.
"""
import re

from django.core import signing

SALT = 'notati.download'
MAX_AGE = 12 * 60 * 60      # a tab left open overnight gets fresh links on reload


def token_for(user, kind, pk):
    return signing.TimestampSigner(salt=SALT).sign_object({'u': user.pk, 'k': kind, 'id': pk})


def user_from_token(token, kind, pk):
    """The user a link was issued to — or None if the token is missing, forged,
    expired, or was issued for a different file."""
    from .models import User
    if not token:
        return None
    try:
        data = signing.TimestampSigner(salt=SALT).unsign_object(token, max_age=MAX_AGE)
    except signing.BadSignature:            # SignatureExpired is one of these
        return None
    if data.get('k') != kind or data.get('id') != pk:
        return None
    return User.objects.filter(pk=data.get('u'), is_active=True).first()


def link(path, user, kind, pk):
    """The download path relative to the API root, tokenised for a signed-in
    user; a guest reading a free chapter needs no token."""
    return f'{path}?t={token_for(user, kind, pk)}' if user else path


def expires_at(now):
    return int(now.timestamp()) + MAX_AGE


def filename_for(note, label, stored_name):
    """What the saved file is called: 'ITCS342 Ch.1 - Introduction to analysis.pdf'.
    The stored name is a random Cloudinary id — meaningless in a Downloads
    folder — so only its extension survives."""
    ext = stored_name.rsplit('.', 1)[-1].lower() if '.' in stored_name else 'pdf'
    head = f'{note.course.name} Ch.{note.chapter_number}'
    body = (label or note.chapter_title or '').strip()
    name = f'{head} - {body}' if body else head
    name = re.sub(r'[\\/:*?"<>|\r\n\t]+', ' ', name)
    name = re.sub(r'\s+', ' ', name).strip(' .')
    return f'{name[:120]}.{ext}'


EXPIRED_PAGE = """<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Download link expired</title>
<style>body{font:16px/1.5 -apple-system,system-ui,sans-serif;color:#3b2f2a;background:#fbf7f3;
margin:0;padding:48px 24px;text-align:center}h1{font-size:22px;margin:0 0 8px}p{margin:0 0 20px;color:#6b5f58}
a{display:inline-block;padding:10px 20px;border-radius:999px;background:#5c4033;color:#fbf7f3;text-decoration:none;font-weight:700}</style>
<h1>This download link has expired</h1>
<p>Links are only valid for a while after the page loads. Go back to Notati and press Download again.</p>
<a href="javascript:history.back()">Back to Notati</a>"""
