"""Builds the sales workbook — an .xlsx that Numbers opens natively on Mac,
iPhone, iPad and iCloud.com.

Deliberately the same two tables the record has always been kept in, so it reads
exactly like the old Notes_selling file:

  Courses    semester x course, copies sold, with the two totals rows underneath
  semsters   month x semester, revenue, with Total and Per month underneath

The old hand-kept years and the website's own counts go in the same cells — the
semesters before the website are filled from sales_history.json, the ones since
are counted from the database. A semester with both simply adds them.

  Sales ledger   one row per chapter sold — the detail the old file never had

The database is the record; this file is a view of it, rebuilt from scratch every
time it is downloaded, so it can never drift and never needs merging. The flip
side: never edit the generated file by hand, because the next download replaces
it completely.
"""
import json
import re
from decimal import Decimal
from io import BytesIO
from pathlib import Path

from django.utils import timezone

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from .models import OrderItem, Semester

HISTORY_PATH = Path(__file__).resolve().parent / 'sales_history.json'

# The colours the old record used, so the file still looks like itself.
LABEL_FILL = PatternFill('solid', fgColor='C3D69B')   # olive semester/month labels
TOTAL_FILL = PatternFill('solid', fgColor='F4C7A8')   # peach totals strip
GRAND_FILL = PatternFill('solid', fgColor='7DC242')   # green grand total
COUNT_FILL = PatternFill('solid', fgColor='FF6D6D')   # red copies grand total
HEAD_FONT  = Font(bold=True, size=10)
GREY       = Font(italic=True, color='9A9A9A', size=10)
THIN = Side(style='thin', color='9A9A9A')
BOX  = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)


def _load_history():
    try:
        with open(HISTORY_PATH, encoding='utf-8') as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def _course_key(name):
    """The bare course code, used to line a course up with its older self.

    Courses get renamed as they merge or are recoded — 'ACC112' became
    'ACC112 / ACA112', 'ITIS204 (BIS202)' is now 'ITIS204'. Matching on the first
    code keeps one column per course instead of opening a second one for what is
    really the same course."""
    head = re.split(r'[/(]', name or '', maxsplit=1)[0]
    return head.strip().upper().replace(' ', '') or (name or '').strip().upper()


def _put(ws, row, col, value, *, fill=None, font=None, money=False):
    cell = ws.cell(row=row, column=col, value=value)
    cell.border = BOX
    if fill:
        cell.fill = fill
    if font:
        cell.font = font
    if money:
        cell.number_format = '0.###'
    return cell


def _net(item):
    """A line's share of its order's discount taken off, so revenue is what
    actually landed rather than list price."""
    price = item.price or Decimal('0')
    pct = Decimal(item.order.discount_percent or 0)
    return price - (price * pct / Decimal(100)).quantize(Decimal('0.001'))


# ── Gathering ─────────────────────────────────────────────────────────────────

def _semester_labels(history):
    """Every semester, in order — the seeded list, plus any label that only the
    old record knows about."""
    labels = [s.label for s in Semester.objects.all()]
    for label in history.get('semesters', []):
        if label not in labels:
            labels.append(label)
    return labels


def _course_columns(history, items):
    """Course columns in the order the old record had them, with anything new
    appended. The newest name seen for a code is the one shown."""
    names, order = {}, []

    def register(name):
        key = _course_key(name)
        if key not in names:
            names[key] = name
            order.append(key)
        return key

    for name in history.get('courses', []):
        register(name)
    for item in items:
        key = register(item.course_name or '(unknown)')
        names[key] = item.course_name or '(unknown)'   # today's name wins
    return order, names


# ── Sheet: Courses ────────────────────────────────────────────────────────────

def _sheet_courses(wb, items, history):
    ws = wb.create_sheet('Courses')
    keys, names = _course_columns(history, items)
    labels = _semester_labels(history)

    # Hand-kept copies, keyed the same way as the live ones.
    hist = {}
    for entry in history.get('course_rows', []):
        for name, value in entry['copies'].items():
            hist[(entry['semester'], _course_key(name))] = value
    hist_value = {_course_key(n): v
                  for n, v in (history.get('course_total_value') or {}).items()}

    live_copies, live_value = {}, {}
    for item in items:
        key = _course_key(item.course_name or '(unknown)')
        label = item.order.semester.label if item.order.semester else 'Unassigned'
        if label not in labels:
            labels.append(label)
        live_copies[(label, key)] = live_copies.get((label, key), 0) + 1
        live_value[key] = live_value.get(key, Decimal('0')) + _net(item)

    ws.column_dimensions['A'].width = 22
    for idx in range(len(keys)):
        ws.column_dimensions[get_column_letter(idx + 2)].width = 13
    ws.column_dimensions[get_column_letter(len(keys) + 2)].width = 16

    row = 1
    _put(ws, row, 1, 'Semester', fill=LABEL_FILL, font=HEAD_FONT)
    for idx, key in enumerate(keys, start=2):
        _put(ws, row, idx, names[key], fill=LABEL_FILL, font=HEAD_FONT).alignment = \
            Alignment(horizontal='center', wrap_text=True)
    _put(ws, row, len(keys) + 2, 'Number Of Copies',
         fill=LABEL_FILL, font=HEAD_FONT).alignment = Alignment(horizontal='center',
                                                                wrap_text=True)
    ws.freeze_panes = 'B2'
    row += 1

    col_copies = {k: 0 for k in keys}
    for label in labels:
        _put(ws, row, 1, label, fill=LABEL_FILL, font=Font(size=10))
        line = 0
        for idx, key in enumerate(keys, start=2):
            old = hist.get((label, key))
            new = live_copies.get((label, key), 0)
            old_num = old if isinstance(old, (int, float)) else 0
            if isinstance(old, str) and not new:
                # 'No Pay' / 'Summer' — not on sale, not offered. Never a zero.
                _put(ws, row, idx, old, font=GREY)
                continue
            total = old_num + new
            _put(ws, row, idx, total if (old is not None or new) else None)
            col_copies[key] += total
            line += total
        _put(ws, row, len(keys) + 2, line or None, font=Font(bold=True, size=10))
        row += 1

    _put(ws, row, 1, 'Total copies sold', fill=TOTAL_FILL, font=HEAD_FONT)
    for idx, key in enumerate(keys, start=2):
        _put(ws, row, idx, col_copies[key], fill=TOTAL_FILL, font=HEAD_FONT)
    _put(ws, row, len(keys) + 2, sum(col_copies.values()),
         fill=COUNT_FILL, font=Font(bold=True, size=10))
    row += 1

    _put(ws, row, 1, 'Total value of copies sold', fill=TOTAL_FILL, font=HEAD_FONT)
    grand_value = 0.0
    for idx, key in enumerate(keys, start=2):
        value = float(hist_value.get(key) or 0) + float(live_value.get(key, 0))
        grand_value += value
        _put(ws, row, idx, round(value, 3) or None, fill=TOTAL_FILL, font=HEAD_FONT,
             money=True)
    _put(ws, row, len(keys) + 2, round(grand_value, 3),
         fill=GRAND_FILL, font=Font(bold=True, size=10), money=True)
    return ws


# ── Sheet: semsters ───────────────────────────────────────────────────────────

def _month_index(items):
    """Revenue per (semester, month-number-within-that-semester).

    The old record counted 'Month 1..6' inside a term rather than calendar
    months, so the website's sales are numbered the same way: the first calendar
    month a semester sold anything is Month 1, and gaps stay gaps."""
    by_sem = {}
    for item in items:
        order = item.order
        when = order.paid_at or order.created_at
        if not when:
            continue
        label = order.semester.label if order.semester else 'Unassigned'
        stamp = timezone.localtime(when)
        by_sem.setdefault(label, {})
        key = (stamp.year, stamp.month)
        by_sem[label][key] = by_sem[label].get(key, Decimal('0')) + _net(item)

    out = {}
    for label, months in by_sem.items():
        first = min(months)
        for (year, month), value in months.items():
            offset = (year - first[0]) * 12 + (month - first[1]) + 1
            out[(label, offset)] = out.get((label, offset), Decimal('0')) + value
    return out


def _sheet_semesters(wb, items, history):
    ws = wb.create_sheet('semsters')
    labels = _semester_labels(history)

    hist = {}
    for entry in history.get('month_rows', []):
        number = int(re.sub(r'\D', '', entry['month']) or 0)
        for label, value in entry['revenue'].items():
            hist[(label, number)] = value

    live = _month_index(items)
    for label, _ in live:
        if label not in labels:
            labels.append(label)
    months = max([n for _, n in list(hist) + list(live)] + [6])

    ws.column_dimensions['A'].width = 14
    for idx in range(len(labels)):
        ws.column_dimensions[get_column_letter(idx + 2)].width = 15
    ws.column_dimensions[get_column_letter(len(labels) + 2)].width = 13

    row = 1
    _put(ws, row, 1, 'Month', fill=LABEL_FILL, font=HEAD_FONT)
    for idx, label in enumerate(labels, start=2):
        _put(ws, row, idx, label, fill=LABEL_FILL, font=HEAD_FONT).alignment = \
            Alignment(horizontal='center', wrap_text=True)
    ws.freeze_panes = 'B2'
    row += 1

    totals = {label: 0.0 for label in labels}
    filled = {label: 0 for label in labels}
    for number in range(1, months + 1):
        _put(ws, row, 1, f'Month {number}', fill=LABEL_FILL, font=Font(size=10))
        for idx, label in enumerate(labels, start=2):
            old = hist.get((label, number))
            new = live.get((label, number))
            if old is None and new is None:
                _put(ws, row, idx, None)
                continue
            value = round(float(old or 0) + float(new or 0), 3)
            _put(ws, row, idx, value, money=True)
            totals[label] += value
            filled[label] += 1
        row += 1

    _put(ws, row, 1, 'Total', fill=TOTAL_FILL, font=HEAD_FONT)
    for idx, label in enumerate(labels, start=2):
        _put(ws, row, idx, round(totals[label], 3), fill=TOTAL_FILL, font=HEAD_FONT,
             money=True)
    _put(ws, row, len(labels) + 2, round(sum(totals.values()), 3),
         fill=GRAND_FILL, font=Font(bold=True, size=10), money=True)
    row += 1

    _put(ws, row, 1, 'Per month', fill=TOTAL_FILL, font=HEAD_FONT)
    months_used = 0
    for idx, label in enumerate(labels, start=2):
        count = filled[label]
        months_used += count
        _put(ws, row, idx, round(totals[label] / count, 3) if count else None,
             fill=TOTAL_FILL, font=HEAD_FONT, money=True)
    _put(ws, row, len(labels) + 2,
         round(sum(totals.values()) / months_used, 3) if months_used else None,
         font=Font(bold=True, size=10), money=True)
    return ws


# ── Sheet: Sales ledger ───────────────────────────────────────────────────────

def _sheet_ledger(wb, items):
    """The detail the old file never had: who bought what, and when."""
    ws = wb.create_sheet('Sales ledger')
    heads = ['Date paid', 'Semester', 'Order', 'Student', 'Email', 'College',
             'Course', 'Ch.', 'Chapter title', 'Price', 'Discount', 'Net', 'Ref']
    for idx, (head, width) in enumerate(
            zip(heads, [12, 20, 11, 22, 26, 14, 20, 6, 28, 9, 14, 9, 16]), start=1):
        _put(ws, 1, idx, head, fill=LABEL_FILL, font=HEAD_FONT)
        ws.column_dimensions[get_column_letter(idx)].width = width
    ws.freeze_panes = 'A2'

    row, gross, net_total = 2, Decimal('0'), Decimal('0')
    for item in items:
        order = item.order
        net = _net(item)
        gross += item.price or Decimal('0')
        net_total += net
        paid = order.paid_at or order.created_at
        values = [
            timezone.localtime(paid).strftime('%Y-%m-%d') if paid else '',
            order.semester.label if order.semester else '',
            order.code or f'#{order.pk}',
            order.user.name, order.user.email, order.user.college or '',
            item.course_name, item.chapter_number, item.chapter_title,
            float(item.price or 0),
            f'{order.discount_code} ({order.discount_percent}%)'
            if order.discount_code else '',
            float(net),
            order.note or '',
        ]
        for idx, value in enumerate(values, start=1):
            _put(ws, row, idx, value, money=idx in (10, 12))
        row += 1

    _put(ws, row, 1, 'Total', fill=TOTAL_FILL, font=HEAD_FONT)
    for idx in range(2, 14):
        _put(ws, row, idx, None, fill=TOTAL_FILL)
    _put(ws, row, 9, f'{row - 2} chapters', fill=TOTAL_FILL, font=HEAD_FONT)
    _put(ws, row, 10, float(gross), fill=TOTAL_FILL, font=HEAD_FONT, money=True)
    _put(ws, row, 12, float(net_total), fill=TOTAL_FILL, font=HEAD_FONT, money=True)
    return ws


# ── Entry point ───────────────────────────────────────────────────────────────

def build_sales_workbook():
    """Returns (filename, xlsx bytes)."""
    generated = timezone.localtime()
    history = _load_history()

    items = list(
        OrderItem.objects
        .filter(order__status='paid')
        .select_related('order', 'order__user', 'order__semester')
        .order_by('order__paid_at', 'order_id', 'id')
    )

    wb = Workbook()
    wb.remove(wb.active)
    _sheet_semesters(wb, items, history)
    _sheet_courses(wb, items, history)
    _sheet_ledger(wb, items)

    buf = BytesIO()
    wb.save(buf)
    return f'Notati sales {generated:%Y-%m-%d}.xlsx', buf.getvalue()
