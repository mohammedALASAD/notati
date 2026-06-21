"""PDF watermarking and sampling helpers.

Watermarking is applied on-the-fly at download time so we never store
per-buyer copies. All functions operate on raw PDF bytes.

Design rule: watermarking is best-effort and *fails open* for full
downloads (a broken stamp must never block a paid download). Sampling,
however, truncates BEFORE stamping so a stamping failure can never leak
the full document.
"""
from io import BytesIO

from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import Color
from reportlab.pdfgen import canvas


def is_pdf(content):
    return bool(content) and content[:4] == b'%PDF'


def _overlay_for_page(width, height, diagonal_text, footer_text):
    """Build a single-page overlay PDF (as a pypdf page) matching the given size."""
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=(width, height))

    if diagonal_text:
        c.saveState()
        c.translate(width / 2.0, height / 2.0)
        c.rotate(45)
        c.setFont('Helvetica-Bold', 26)
        c.setFillColor(Color(0.5, 0.5, 0.5, alpha=0.13))
        span = int(max(width, height))
        for y in range(-span, span, 90):
            c.drawCentredString(0, y, diagonal_text)
        c.restoreState()

    if footer_text:
        c.setFont('Helvetica', 8)
        c.setFillColor(Color(0.35, 0.35, 0.35, alpha=0.7))
        c.drawCentredString(width / 2.0, 12, footer_text)

    c.save()
    buf.seek(0)
    return PdfReader(buf).pages[0]


def _stamp_pages(content, diagonal_text='', footer_text=''):
    """Overlay watermark + footer on every page. Returns new bytes. May raise."""
    reader = PdfReader(BytesIO(content))
    writer = PdfWriter()
    for page in reader.pages:
        overlay = _overlay_for_page(
            float(page.mediabox.width), float(page.mediabox.height),
            diagonal_text, footer_text,
        )
        page.merge_page(overlay)
        writer.add_page(page)
    out = BytesIO()
    writer.write(out)
    return out.getvalue()


def truncate_pdf(content, max_pages):
    """Return a PDF containing only the first `max_pages` pages. May raise."""
    reader = PdfReader(BytesIO(content))
    writer = PdfWriter()
    for page in reader.pages[:max_pages]:
        writer.add_page(page)
    out = BytesIO()
    writer.write(out)
    return out.getvalue()


def watermark_for_user(content, email):
    """Full document stamped with the buyer's email. Fails open to the original."""
    if not is_pdf(content):
        return content
    try:
        return _stamp_pages(
            content,
            diagonal_text=email,
            footer_text=f'Licensed to {email}  ·  Notati',
        )
    except Exception:
        return content


def sample_pdf(content, pages=2):
    """First `pages` pages, stamped SAMPLE. Truncates first so a stamping
    failure can never leak the full document. Raises only if truncation fails."""
    if not is_pdf(content):
        return content
    truncated = truncate_pdf(content, pages)
    try:
        return _stamp_pages(
            truncated,
            diagonal_text='SAMPLE',
            footer_text='Sample preview  ·  Purchase the full notes on Notati',
        )
    except Exception:
        return truncated
