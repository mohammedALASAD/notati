"""
Notati — branded HTML email template for support messages.
Used by the admin panel "Send email" feature.
"""
import logging
import threading
from django.conf import settings

log = logging.getLogger(__name__)

# ── Brand colours ─────────────────────────────────────────────────────────────
_BARK   = '#3D2B1F'
_WALNUT = '#6B5744'
_PAPER  = '#FBF7F3'
_CREAM  = '#EDE5DC'
_SAND   = '#B5A090'
_MUTED  = '#8A7A6F'


def _esc(s):
    return (s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def _build_html(to_name, subject, message):
    first = to_name.split()[0] if to_name else 'there'
    # Convert plain newlines → HTML line breaks
    body_html = message.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('\n', '<br/>')

    return f'''<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <meta name="x-apple-disable-message-reformatting"/>
  <title>{subject}</title>
  <style>
    body,table,td,a{{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}}
    table,td{{mso-table-lspace:0;mso-table-rspace:0;}}
    @media only screen and (max-width:620px){{
      .card{{padding:28px 20px!important;}}
    }}
  </style>
</head>
<body style="margin:0;padding:0;background:{_PAPER};-webkit-font-smoothing:antialiased;">

  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">{subject}&#8203;&#847;&#847;&#847;</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:{_PAPER};padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px;width:100%;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding:0 0 24px;">
              <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                           font-size:22px;font-weight:900;letter-spacing:-0.5px;color:{_BARK};">
                Notati
              </span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td class="card"
                style="background:#FFFFFF;border:1px solid rgba(181,160,144,0.40);
                       border-radius:20px;padding:40px 44px;">

              <!-- Subject / heading -->
              <h1 style="margin:0 0 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                          font-size:24px;font-weight:800;color:{_BARK};letter-spacing:-0.3px;line-height:1.2;">
                {subject}
              </h1>

              <!-- Greeting -->
              <p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                         font-size:15px;color:#5C4A3A;line-height:1.7;">
                Hi {first},
              </p>

              <!-- Message body -->
              <p style="margin:0 0 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                         font-size:15px;color:#5C4A3A;line-height:1.8;">
                {body_html}
              </p>

              <!-- Divider -->
              <hr style="margin:0 0 20px;border:0;border-top:1px solid {_CREAM};" role="presentation"/>

              <!-- Sign-off -->
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                         font-size:15px;color:#5C4A3A;line-height:1.7;">
                Best,<br/>
                <strong style="color:{_BARK};">The Notati Team</strong>
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:24px 0 0;">
              <p style="margin:0 0 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                         font-size:12px;color:{_MUTED};line-height:1.6;">
                Questions? Reply to this email or contact
                <a href="mailto:support@notati.app" style="color:{_MUTED};text-decoration:underline;">support@notati.app</a>
              </p>
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
                         font-size:12px;color:{_SAND};line-height:1.6;">
                &copy; 2025 Notati &middot; Bahrain
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>'''


def _send_async(payload):
    def _worker():
        try:
            import resend
            resend.api_key = getattr(settings, 'RESEND_API_KEY', '')
            if not resend.api_key:
                log.error('RESEND_API_KEY is not set — email not sent.')
                return
            resend.Emails.send(payload)
            log.info('Email sent to %s', payload.get('to'))
        except Exception as exc:
            log.exception('Failed to send email via Resend: %s', exc)
    threading.Thread(target=_worker, daemon=True).start()


def _build_alert_html(subject, message, url=None):
    body_html = message.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('\n', '<br/>')
    font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif"
    button = ''
    if url:
        button = f'''
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0;">
            <tr><td align="center" bgcolor="{_WALNUT}" style="border-radius:999px;">
              <a href="{url}" target="_blank" style="display:inline-block;font-family:{font};font-size:15px;font-weight:700;color:{_PAPER};text-decoration:none;padding:13px 34px;border-radius:999px;">Open Notati &rarr;</a>
            </td></tr>
          </table>'''
    return f'''<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>{subject}</title></head>
<body style="margin:0;padding:0;background:{_PAPER};-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{_PAPER};padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
        <tr><td align="center" style="padding:0 0 20px;">
          <span style="font-family:{font};font-size:20px;font-weight:900;color:{_BARK};">Notati</span>
          <span style="font-family:{font};font-size:11px;color:{_MUTED};display:block;margin-top:5px;letter-spacing:.1em;text-transform:uppercase;">Admin alert</span>
        </td></tr>
        <tr><td style="background:#FFFFFF;border:1px solid rgba(181,160,144,0.40);border-radius:20px;padding:32px 36px;">
          <h1 style="margin:0 0 20px;font-family:{font};font-size:22px;font-weight:800;color:{_BARK};line-height:1.25;">{subject}</h1>
          <p style="margin:0;font-family:{font};font-size:15px;color:#5C4A3A;line-height:1.8;">{body_html}</p>
          {button}
        </td></tr>
        <tr><td align="center" style="padding:20px 0 0;">
          <p style="margin:0;font-family:{font};font-size:12px;color:{_MUTED};">Automated alert &middot; Notati &middot; Bahrain</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>'''


def _build_order_ready_html(to_name, chapters, url):
    """Customer email: payment confirmed, chapters unlocked, with a button through
    to the library. `chapters` is a list of human strings like
    'MGMT233 · Ch.4: Working Capital'."""
    first = _esc(to_name.split()[0]) if to_name else 'there'
    font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif"
    n = len(chapters)
    count = f'{n} chapter{"s" if n != 1 else ""}'
    items_html = ''.join(
        f'<tr><td style="padding:11px 16px;border-bottom:1px solid {_CREAM};'
        f'font-family:{font};font-size:14px;color:#5C4A3A;">{_esc(c)}</td></tr>'
        for c in chapters
    )
    button = f'''
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 4px;">
        <tr><td align="center" bgcolor="{_WALNUT}" style="border-radius:999px;">
          <a href="{url}" target="_blank" style="display:inline-block;font-family:{font};font-size:15px;font-weight:700;color:{_PAPER};text-decoration:none;padding:13px 34px;border-radius:999px;">Open my chapters &rarr;</a>
        </td></tr>
      </table>'''
    return f'''<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="x-apple-disable-message-reformatting"/>
  <title>Your chapters are unlocked</title>
</head>
<body style="margin:0;padding:0;background:{_PAPER};-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{_PAPER};padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
        <tr><td align="center" style="padding:0 0 24px;">
          <span style="font-family:{font};font-size:22px;font-weight:900;letter-spacing:-0.5px;color:{_BARK};">Notati</span>
        </td></tr>
        <tr><td style="background:#FFFFFF;border:1px solid rgba(181,160,144,0.40);border-radius:20px;padding:40px 44px;">
          <h1 style="margin:0 0 20px;font-family:{font};font-size:24px;font-weight:800;color:{_BARK};letter-spacing:-0.3px;line-height:1.2;">You're all set.</h1>
          <p style="margin:0 0 16px;font-family:{font};font-size:15px;color:#5C4A3A;line-height:1.7;">Hi {first},</p>
          <p style="margin:0 0 22px;font-family:{font};font-size:15px;color:#5C4A3A;line-height:1.8;">
            Thank you for your purchase. Your payment is confirmed and {count} {"are" if n != 1 else "is"} now unlocked in your Notati library:
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:{_PAPER};border:1px solid {_CREAM};border-radius:12px;margin:0 0 4px;">
            {items_html}
          </table>
          {button}
          <hr style="margin:28px 0 20px;border:0;border-top:1px solid {_CREAM};" role="presentation"/>
          <p style="margin:0;font-family:{font};font-size:15px;color:#5C4A3A;line-height:1.7;">
            Happy studying,<br/><strong style="color:{_BARK};">The Notati Team</strong>
          </p>
        </td></tr>
        <tr><td align="center" style="padding:24px 0 0;">
          <p style="margin:0 0 4px;font-family:{font};font-size:12px;color:{_MUTED};line-height:1.6;">
            Questions? Reply to this email or contact
            <a href="mailto:support@notati.app" style="color:{_MUTED};text-decoration:underline;">support@notati.app</a>
          </p>
          <p style="margin:0;font-family:{font};font-size:12px;color:{_SAND};line-height:1.6;">&copy; 2025 Notati &middot; Bahrain</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>'''


def send_order_paid_email(order):
    """Tell the student their payment is confirmed and their chapters are unlocked.
    Best-effort; never blocks the admin's mark-as-paid action."""
    user = getattr(order, 'user', None)
    if not user or not user.email:
        return
    url = getattr(settings, 'SITE_URL', '') or 'https://notati.app'
    chapters = []
    for it in order.items.all():
        prefix = f'{it.course_name} · ' if it.course_name else ''
        chapters.append(f'{prefix}Ch.{it.chapter_number}: {it.chapter_title}')
    _send_async({
        'from': 'Notati <support@notati.app>',
        'to': [user.email],
        'subject': 'Your chapters are unlocked',
        'html': _build_order_ready_html(user.name, chapters, url),
    })


def send_admin_alert(subject, message):
    """Notify the site admin (ADMIN_ALERT_EMAIL) of student activity —
    a new order, upload, or review. Best-effort; never blocks the student."""
    to = getattr(settings, 'ADMIN_ALERT_EMAIL', '') or 'support@notati.app'
    url = getattr(settings, 'SITE_URL', '') or 'https://notati.app'
    _send_async({
        'from': 'Notati <support@notati.app>',
        'to': [to],
        'subject': subject,
        'html': _build_alert_html(subject, message, url),
    })


def send_support_email(to_email, to_name, subject, message):
    _send_async({
        'from': 'Notati <support@notati.app>',
        'to': [to_email],
        'subject': subject,
        'html': _build_html(to_name, subject, message),
    })


def send_code_email(to_user, code, purpose):
    """Send a one-time verification / reset code to the user."""
    if purpose == 'activate':
        subject = 'Your Notati verification code'
        message = (f'Your verification code is:\n\n{code}\n\n'
                   'Enter it on the site to activate your account. '
                   'This code expires in 5 minutes.')
    else:
        subject = 'Your Notati password reset code'
        message = (f'Use this code to reset your Notati password:\n\n{code}\n\n'
                   "It expires in 5 minutes. If you didn't request this, ignore this email.")

    # In environments without Resend configured (e.g. local dev), log the code
    # so the flow can still be tested. In production (key set) the code is never logged.
    if not getattr(settings, 'RESEND_API_KEY', ''):
        log.warning('No RESEND_API_KEY — %s code for %s: %s', purpose, to_user.email, code)

    _send_async({
        'from': 'Notati <support@notati.app>',
        'to': [to_user.email],
        'subject': subject,
        'html': _build_html(to_user.name, subject, message),
    })
