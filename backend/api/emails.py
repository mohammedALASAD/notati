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
