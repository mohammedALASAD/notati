"""
Per-download fingerprinting.

Every note delivered to a student is stamped with a short `code` derived
deterministically from (user, note) with an HMAC keyed by SECRET_KEY. Because it's
deterministic, a leaked PDF can be traced back to the exact student even without a
log row — but we also log every download (see DownloadLog) for timestamps and IPs.
"""

import base64
import hashlib
import hmac

from django.conf import settings


def code_for(user_id, note_id):
    """Stable, unguessable trace code for a (user, note) pair. base32 (A–Z, 2–7):
    no ambiguous 0/1/8/9 characters, so it's easy to read off a leaked file."""
    msg = f'{user_id}:{note_id}'.encode()
    digest = hmac.new(settings.SECRET_KEY.encode(), msg, hashlib.sha256).digest()
    return base64.b32encode(digest).decode().rstrip('=')[:8]


def find_by_code(code):
    """Reverse a trace code back to the download(s) it belongs to.

    Tries the DownloadLog first (fast, gives timestamps/IPs). Falls back to
    recomputing the HMAC across every user×note so a code still resolves even if
    its log rows were pruned. Returns a list of dicts.
    """
    from .models import DownloadLog, User, Note

    code = (code or '').strip().upper()
    results = []
    seen = set()

    for log in DownloadLog.objects.filter(code=code).select_related('user', 'note'):
        key = (log.user_id, log.note_id)
        if key in seen:
            continue
        seen.add(key)
        results.append({
            'code': code,
            'user_id': log.user_id,
            'email': log.user.email if log.user else None,
            'name': log.user.name if log.user else None,
            'note_id': log.note_id,
            'note': _note_label(log.note),
            'first_seen': None,
            'last_seen': log.created_at,
            'downloads': DownloadLog.objects.filter(code=code, user=log.user_id, note=log.note_id).count(),
            'source': 'log',
        })

    if results:
        return results

    # Fallback: brute-force the HMAC space (small for this app).
    note_ids = list(Note.objects.values_list('id', flat=True))
    for u in User.objects.all():
        for nid in note_ids:
            if code_for(u.id, nid).upper() == code:
                note = Note.objects.filter(pk=nid).first()
                results.append({
                    'code': code,
                    'user_id': u.id,
                    'email': u.email,
                    'name': u.name,
                    'note_id': nid,
                    'note': _note_label(note),
                    'downloads': 0,
                    'source': 'recomputed',
                })
    return results


def _note_label(note):
    if not note:
        return None
    course = note.course.name if note.course_id else ''
    return f'{course} Ch.{note.chapter_number}: {note.chapter_title}'.strip()
