"""PDF sampling helpers.

Builds a teaser preview of a paid note: the first couple of pages are kept
crisp, and the next few pages are rendered to images, blurred, and stamped
'Purchase to unlock'. The real content of the hidden pages is never placed in
the output (blurred pages are raster images), and a multi-page note never shows
all of its pages — so a sample can't leak the document. Operates on raw bytes.
"""
from io import BytesIO

import pypdfium2 as pdfium
from PIL import ImageFilter
from pypdf import PdfReader, PdfWriter
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

CLEAR_PAGES = 2     # opening pages shown in full
BLUR_PAGES  = 6     # further pages shown blurred
BLUR_RADIUS = 8


def is_pdf(content):
    return bool(content) and content[:4] == b'%PDF'


def _blurred_page(pdfium_page, width_pt, height_pt):
    """Render a page, blur it, and return a one-page pypdf page (sized to the
    original) with a 'Purchase to unlock' overlay."""
    bitmap = pdfium_page.render(scale=1.0)
    img = bitmap.to_pil().convert('RGB').filter(ImageFilter.GaussianBlur(BLUR_RADIUS))
    img_buf = BytesIO()
    img.save(img_buf, format='JPEG', quality=50)
    img_buf.seek(0)

    out = BytesIO()
    c = canvas.Canvas(out, pagesize=(width_pt, height_pt))
    c.drawImage(ImageReader(img_buf), 0, 0, width=width_pt, height=height_pt)
    c.setFont('Helvetica-Bold', 20)
    c.setFillColorRGB(0.15, 0.15, 0.15)
    c.drawCentredString(width_pt / 2.0, height_pt / 2.0, 'Purchase to unlock')
    c.save()
    out.seek(0)
    return PdfReader(out).pages[0]


def sample_pdf(content):
    """Return a teaser PDF: first CLEAR_PAGES crisp, then up to BLUR_PAGES
    blurred. Never shows every page of a multi-page note. May raise — the caller
    returns an error rather than ever serving the full document."""
    reader = PdfReader(BytesIO(content))
    n = len(reader.pages)
    # Never show every page in full — for short notes hide at least the last page.
    clear = min(CLEAR_PAGES, max(1, n - 1))
    last = min(n, clear + BLUR_PAGES)

    pdf = pdfium.PdfDocument(content)
    writer = PdfWriter()
    try:
        for i in range(last):
            if i < clear:
                writer.add_page(reader.pages[i])
            else:
                w = float(reader.pages[i].mediabox.width)
                h = float(reader.pages[i].mediabox.height)
                try:
                    writer.add_page(_blurred_page(pdf[i], w, h))
                except Exception:
                    # Skip a page we couldn't render rather than risk leaking it.
                    continue
    finally:
        pdf.close()

    out = BytesIO()
    writer.write(out)
    return out.getvalue()


# ── Per-download fingerprint ──────────────────────────────────────────────────

def _code_overlay(width_pt, height_pt, text):
    """A near-invisible layer that tiles `text` across the page. Uses a very low
    fill alpha instead of near-white ink so it stays imperceptible on dark or
    coloured backgrounds, while remaining real page text that survives printing
    and re-saving to PDF."""
    out = BytesIO()
    c = canvas.Canvas(out, pagesize=(width_pt, height_pt))
    c.setFont('Helvetica', 6)
    c.setFillColorRGB(0.5, 0.5, 0.5)
    try:
        c.setFillAlpha(0.05)
    except Exception:
        pass
    step_x, step_y = 170, 220
    y = 24
    while y < height_pt:
        x = 20
        while x < width_pt:
            c.drawString(x, y, text)
            x += step_x
        y += step_y
    c.save()
    out.seek(0)
    return PdfReader(out).pages[0]


def fingerprint_pdf(content, code):
    """Return `content` stamped with the trace `code`: the code is tiled across
    every page as near-invisible text and written into the PDF metadata. Best
    effort — on any failure the original bytes are returned so a paid download is
    never blocked by watermarking."""
    try:
        reader = PdfReader(BytesIO(content))
        if reader.is_encrypted:
            try:
                reader.decrypt('')
            except Exception:
                return content
        writer = PdfWriter()
        overlays = {}
        marker = f'NT-{code}'
        for page in reader.pages:
            w = float(page.mediabox.width)
            h = float(page.mediabox.height)
            key = (round(w, 1), round(h, 1))
            if key not in overlays:
                overlays[key] = _code_overlay(w, h, marker)
            try:
                page.merge_page(overlays[key])
            except Exception:
                pass  # keep the page even if the overlay won't merge
            writer.add_page(page)
        writer.add_metadata({
            '/Producer': 'Notati',
            '/Keywords': f'notati-trace:{code}',
            '/NotatiTrace': code,
        })
        out = BytesIO()
        writer.write(out)
        return out.getvalue()
    except Exception:
        return content
