"""Builds the sales workbook — an .xlsx that Numbers opens natively on Mac,
iPhone, iPad and iCloud.com.

The database is the record; this file is a view of it, regenerated from scratch
every time. Nothing is ever appended, so the workbook can't drift from the
truth and there is no merge step. The flip side: never edit the generated file
by hand, because the next download replaces it.

Sheet layout:
  Sales ledger    one row per chapter sold on a paid order — the raw truth
  By semester     the term-by-term totals, live and historical side by side
  By course       course x semester copies grid, shaped like the old record
  By chapter      which chapters actually sell
  By month        calendar months, for trend rather than term
  Pending         placed but not yet paid — what is owed
  Cancelled       kept for the record, never counted
  Manual unlocks  access granted by hand, at no charge
  History         the hand-kept record from before the website, as recorded
"""
import json
from decimal import Decimal
from io import BytesIO
from pathlib import Path

from django.utils import timezone

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from .models import Access, Order, OrderItem, Semester

HISTORY_PATH = Path(__file__).resolve().parent / 'sales_history.json'

# Picked to match the old record: olive headers, peach totals, green grand total.
HEAD_FILL  = PatternFill('solid', fgColor='A8B770')
TOTAL_FILL = PatternFill('solid', fgColor='F4C7A8')
GRAND_FILL = PatternFill('solid', fgColor='7DC242')
NOTE_FILL  = PatternFill('solid', fgColor='FFF3CD')
HEAD_FONT  = Font(bold=True, color='1B1B1B')
TITLE_FONT = Font(bold=True, size=13)
THIN = Side(style='thin', color='C9C4BC')
BOX  = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)


def _load_history():
    try:
        with open(HISTORY_PATH, encoding='utf-8') as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def _header(ws, row, labels, widths=None):
    for col, label in enumerate(labels, start=1):
        cell = ws.cell(row=row, column=col, value=label)
        cell.fill, cell.font, cell.border = HEAD_FILL, HEAD_FONT, BOX
        cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
    if widths:
        for col, width in enumerate(widths, start=1):
            ws.column_dimensions[get_column_letter(col)].width = width
    ws.freeze_panes = ws.cell(row=row + 1, column=1)


def _title(ws, text, sub=''):
    """A title line above the table, so each sheet says what it is."""
    ws.cell(row=1, column=1, value=text).font = TITLE_FONT
    if sub:
        cell = ws.cell(row=2, column=1, value=sub)
        cell.font = Font(size=10, italic=True, color='6B6B6B')
    return 4 if sub else 3


def _money(cell):
    cell.number_format = '0.000'
    return cell


def _totals_row(ws, row, first_label, cells):
    """A totals strip across the bottom, in the peach the old record used."""
    cell = ws.cell(row=row, column=1, value=first_label)
    cell.fill, cell.font, cell.border = TOTAL_FILL, Font(bold=True), BOX
    for col, value in cells.items():
        cell = ws.cell(row=row, column=col, value=value)
        cell.fill, cell.font, cell.border = TOTAL_FILL, Font(bold=True), BOX
        if isinstance(value, float):
            _money(cell)


# ── Sheets ────────────────────────────────────────────────────────────────────

def _sheet_ledger(wb, items):
    """One row per chapter sold. Everything else in the file is a view of this."""
    ws = wb.create_sheet('Sales ledger')
    top = _title(ws, 'Sales ledger',
                 'One row per chapter on a paid order. The raw record — every other sheet '
                 'is a summary of these rows.')
    _header(ws, top, [
        'Date paid', 'Semester', 'Order', 'Student', 'Email', 'College',
        'Course', 'Ch.', 'Chapter title', 'Price', 'Discount', 'Discount amount',
        'Net', 'Payment ref',
    ], [12, 20, 11, 22, 28, 18, 20, 6, 30, 10, 12, 15, 10, 18])

    row = top + 1
    gross_total = net_total = Decimal('0')
    for item in items:
        order = item.order
        pct = Decimal(order.discount_percent or 0)
        price = item.price or Decimal('0')
        # Spread the order's discount across its lines, so the net column sums to
        # what actually landed rather than to the pre-discount price.
        cut = (price * pct / Decimal(100)).quantize(Decimal('0.001'))
        net = price - cut
        gross_total += price
        net_total += net
        paid = order.paid_at or order.created_at
        values = [
            timezone.localtime(paid).strftime('%Y-%m-%d') if paid else '',
            order.semester.label if order.semester else '',
            order.code or f'#{order.pk}',
            order.user.name, order.user.email, order.user.college or '',
            item.course_name, item.chapter_number, item.chapter_title,
            float(price),
            f'{order.discount_code} ({pct}%)' if order.discount_code else '',
            float(cut) if cut else None,
            float(net),
            order.note or '',
        ]
        for col, value in enumerate(values, start=1):
            cell = ws.cell(row=row, column=col, value=value)
            cell.border = BOX
            if col in (10, 12, 13):
                _money(cell)
        row += 1

    if row > top + 1:
        _totals_row(ws, row, 'Total', {
            9: f'{row - top - 1} chapters',
            10: float(gross_total),
            12: float(gross_total - net_total),
            13: float(net_total),
        })
    return ws


def _sheet_by_semester(wb, items, history):
    """Term-by-term totals, with the hand-kept history kept visibly separate."""
    ws = wb.create_sheet('By semester')
    top = _title(ws, 'By semester',
                 'Website sales and the older hand-kept record, side by side. '
                 'They are never added together — the old figures were entered by hand.')
    _header(ws, top, ['Semester', 'Summer', 'Copies sold', 'Gross (BHD)',
                      'Discounts', 'Net (BHD)', 'Students', 'Hand-kept record (BHD)'],
            [22, 9, 12, 13, 11, 13, 10, 22])

    live = {}
    for item in items:
        order = item.order
        label = order.semester.label if order.semester else 'Unassigned'
        agg = live.setdefault(label, {'copies': 0, 'gross': Decimal('0'),
                                      'net': Decimal('0'), 'students': set()})
        price = item.price or Decimal('0')
        cut = (price * Decimal(order.discount_percent or 0) / Decimal(100)).quantize(Decimal('0.001'))
        agg['copies'] += 1
        agg['gross'] += price
        agg['net'] += price - cut
        agg['students'].add(order.user_id)

    hist_rev = (history or {}).get('semester_revenue', {})
    semesters = list(Semester.objects.all())
    labels = [s.label for s in semesters]
    for extra in list(hist_rev) + list(live):
        if extra not in labels:
            labels.append(extra)
    summer = {s.label: s.is_summer for s in semesters}

    row = top + 1
    tot_copies, tot_gross, tot_net, tot_hist = 0, Decimal('0'), Decimal('0'), 0.0
    for label in labels:
        agg = live.get(label)
        hist = hist_rev.get(label)
        if not agg and not hist:
            continue
        values = [
            label,
            'Yes' if summer.get(label) else '',
            agg['copies'] if agg else None,
            float(agg['gross']) if agg else None,
            float(agg['gross'] - agg['net']) if agg else None,
            float(agg['net']) if agg else None,
            len(agg['students']) if agg else None,
            hist,
        ]
        for col, value in enumerate(values, start=1):
            cell = ws.cell(row=row, column=col, value=value)
            cell.border = BOX
            if col in (4, 5, 6, 8):
                _money(cell)
        if agg:
            tot_copies += agg['copies']
            tot_gross += agg['gross']
            tot_net += agg['net']
        if hist:
            tot_hist += hist
        row += 1

    _totals_row(ws, row, 'Total', {
        3: tot_copies, 4: float(tot_gross),
        5: float(tot_gross - tot_net), 6: float(tot_net), 8: round(tot_hist, 3),
    })
    ws.cell(row=row + 2, column=1,
            value='The last column is your original hand-kept record, shown for '
                  'comparison only. Website figures are exact; the hand-kept ones '
                  'are as they were entered.').fill = NOTE_FILL
    return ws


def _sheet_by_course(wb, items):
    """Course x semester copies, the shape the record has always been read in."""
    ws = wb.create_sheet('By course')
    top = _title(ws, 'By course',
                 'Copies sold per course, per semester — website sales only.')

    grid, courses, sem_labels = {}, [], []
    for item in items:
        label = item.order.semester.label if item.order.semester else 'Unassigned'
        course = item.course_name or '(unknown course)'
        if course not in courses:
            courses.append(course)
        if label not in sem_labels:
            sem_labels.append(label)
        cellkey = (label, course)
        grid[cellkey] = grid.get(cellkey, 0) + 1
    courses.sort()

    _header(ws, top, ['Semester'] + courses + ['Total'],
            [22] + [13] * len(courses) + [11])
    row = top + 1
    col_totals = {c: 0 for c in courses}
    for label in sem_labels:
        ws.cell(row=row, column=1, value=label).border = BOX
        line = 0
        for idx, course in enumerate(courses, start=2):
            count = grid.get((label, course), 0)
            cell = ws.cell(row=row, column=idx, value=count or None)
            cell.border = BOX
            line += count
            col_totals[course] += count
        cell = ws.cell(row=row, column=len(courses) + 2, value=line)
        cell.border, cell.font = BOX, Font(bold=True)
        row += 1

    _totals_row(ws, row, 'Total copies sold',
                {**{i: col_totals[c] for i, c in enumerate(courses, start=2)},
                 len(courses) + 2: sum(col_totals.values())})
    cell = ws.cell(row=row, column=len(courses) + 2)
    cell.fill = GRAND_FILL
    return ws


def _sheet_by_chapter(wb, items):
    ws = wb.create_sheet('By chapter')
    top = _title(ws, 'By chapter', 'Which chapters actually sell, across all time.')
    _header(ws, top, ['Course', 'Ch.', 'Chapter title', 'Copies sold', 'Revenue (BHD)'],
            [22, 6, 34, 12, 14])

    rows = {}
    for item in items:
        key = (item.course_name, item.chapter_number, item.chapter_title)
        agg = rows.setdefault(key, {'copies': 0, 'revenue': Decimal('0')})
        agg['copies'] += 1
        agg['revenue'] += item.price or Decimal('0')

    row = top + 1
    for key, agg in sorted(rows.items(), key=lambda kv: -kv[1]['copies']):
        for col, value in enumerate([key[0], key[1], key[2], agg['copies'],
                                     float(agg['revenue'])], start=1):
            cell = ws.cell(row=row, column=col, value=value)
            cell.border = BOX
            if col == 5:
                _money(cell)
        row += 1

    _totals_row(ws, row, 'Total', {
        4: sum(a['copies'] for a in rows.values()),
        5: float(sum(a['revenue'] for a in rows.values())),
    })
    return ws


def _sheet_by_month(wb, items):
    ws = wb.create_sheet('By month')
    top = _title(ws, 'By month', 'Calendar months, for trend across semesters.')
    _header(ws, top, ['Month', 'Copies sold', 'Gross (BHD)', 'Net (BHD)', 'Students'],
            [14, 12, 14, 14, 10])

    months = {}
    for item in items:
        order = item.order
        when = order.paid_at or order.created_at
        if not when:
            continue
        key = timezone.localtime(when).strftime('%Y-%m')
        agg = months.setdefault(key, {'copies': 0, 'gross': Decimal('0'),
                                      'net': Decimal('0'), 'students': set()})
        price = item.price or Decimal('0')
        cut = (price * Decimal(order.discount_percent or 0) / Decimal(100)).quantize(Decimal('0.001'))
        agg['copies'] += 1
        agg['gross'] += price
        agg['net'] += price - cut
        agg['students'].add(order.user_id)

    row = top + 1
    for key in sorted(months):
        agg = months[key]
        for col, value in enumerate([key, agg['copies'], float(agg['gross']),
                                     float(agg['net']), len(agg['students'])], start=1):
            cell = ws.cell(row=row, column=col, value=value)
            cell.border = BOX
            if col in (3, 4):
                _money(cell)
        row += 1

    _totals_row(ws, row, 'Total', {
        2: sum(a['copies'] for a in months.values()),
        3: float(sum(a['gross'] for a in months.values())),
        4: float(sum(a['net'] for a in months.values())),
    })
    return ws


def _sheet_orders(wb, name, orders, blurb):
    """Pending and cancelled orders — visible, never counted in revenue."""
    ws = wb.create_sheet(name)
    top = _title(ws, name, blurb)
    _header(ws, top, ['Placed', 'Semester', 'Order', 'Student', 'Email',
                      'Chapters', 'Subtotal', 'Discount', 'Total (BHD)'],
            [12, 20, 11, 22, 28, 10, 11, 14, 13])
    row = top + 1
    total = Decimal('0')
    for order in orders:
        total += order.total or Decimal('0')
        values = [
            timezone.localtime(order.created_at).strftime('%Y-%m-%d'),
            order.semester.label if order.semester else '',
            order.code or f'#{order.pk}',
            order.user.name, order.user.email,
            order.items.count(),
            float(order.subtotal or 0),
            f'{order.discount_code} ({order.discount_percent}%)' if order.discount_code else '',
            float(order.total or 0),
        ]
        for col, value in enumerate(values, start=1):
            cell = ws.cell(row=row, column=col, value=value)
            cell.border = BOX
            if col in (7, 9):
                _money(cell)
        row += 1
    _totals_row(ws, row, 'Total', {6: row - top - 1, 9: float(total)})
    return ws


def _sheet_manual_unlocks(wb, grants):
    ws = wb.create_sheet('Manual unlocks')
    top = _title(ws, 'Manual unlocks',
                 'Chapters you unlocked by hand, with no order behind them. Listed at '
                 'their list price so you can see what was given away, but never counted '
                 'as revenue.')
    _header(ws, top, ['Granted', 'Semester', 'Student', 'Email', 'Course', 'Ch.',
                      'Chapter title', 'List price', 'Granted by'],
            [12, 20, 22, 28, 20, 6, 30, 12, 22])
    row = top + 1
    given = Decimal('0')
    for grant in grants:
        note = grant.note
        price = note.price if note else Decimal('0')
        given += price
        values = [
            timezone.localtime(grant.granted_at).strftime('%Y-%m-%d'),
            grant.semester.label if grant.semester else '',
            grant.user.name, grant.user.email,
            note.course.name if note and note.course else '',
            note.chapter_number if note else '',
            note.chapter_title if note else '(chapter deleted)',
            float(price),
            grant.granted_by.name if grant.granted_by else '',
        ]
        for col, value in enumerate(values, start=1):
            cell = ws.cell(row=row, column=col, value=value)
            cell.border = BOX
            if col == 8:
                _money(cell)
        row += 1
    _totals_row(ws, row, 'Total', {7: f'{row - top - 1} unlocks', 8: float(given)})
    return ws


def _sheet_history(wb, history):
    """The hand-kept record, reproduced as recorded — including its own caveats."""
    ws = wb.create_sheet('History (hand-kept)')
    top = _title(ws, 'History — hand-kept record',
                 'Your original Notes_selling record, from before the website tracked '
                 'sales. Reproduced exactly as entered, including its gaps.')

    for offset, caveat in enumerate((history.get('_caveats') or [])):
        cell = ws.cell(row=top + offset, column=1, value='• ' + caveat)
        cell.fill = NOTE_FILL
        cell.alignment = Alignment(wrap_text=True, vertical='top')
    top += len(history.get('_caveats') or []) + 1

    courses = history.get('courses', [])
    _header(ws, top, ['Semester'] + courses + ['Copies'],
            [22] + [13] * len(courses) + [11])
    row = top + 1
    for entry in history.get('course_rows', []):
        ws.cell(row=row, column=1, value=entry['semester']).border = BOX
        for idx, course in enumerate(courses, start=2):
            value = entry['copies'].get(course)
            cell = ws.cell(row=row, column=idx, value=value)
            cell.border = BOX
            if isinstance(value, str):       # 'No Pay' / 'Summer' — not a zero
                cell.font = Font(italic=True, color='9A9A9A')
        cell = ws.cell(row=row, column=len(courses) + 2, value=entry.get('total_copies'))
        cell.border, cell.font = BOX, Font(bold=True)
        row += 1

    totals = history.get('course_total_copies', {})
    values = history.get('course_total_value', {})
    _totals_row(ws, row, 'Total copies sold',
                {**{i: totals.get(c) for i, c in enumerate(courses, start=2)},
                 len(courses) + 2: history.get('grand_total_copies')})
    _totals_row(ws, row + 1, 'Total value of copies sold',
                {**{i: values.get(c) for i, c in enumerate(courses, start=2)},
                 len(courses) + 2: history.get('grand_total_value')})
    ws.cell(row=row, column=len(courses) + 2).fill = GRAND_FILL
    ws.cell(row=row + 1, column=len(courses) + 2).fill = GRAND_FILL

    # The monthly grid underneath, as its own block.
    row += 4
    ws.cell(row=row, column=1, value='Revenue by month within each semester').font = TITLE_FONT
    row += 1
    semesters = history.get('semesters', [])
    _header(ws, row, ['Month'] + semesters)
    row += 1
    for entry in history.get('month_rows', []):
        ws.cell(row=row, column=1, value=entry['month']).border = BOX
        for idx, label in enumerate(semesters, start=2):
            cell = ws.cell(row=row, column=idx, value=entry['revenue'].get(label))
            cell.border = BOX
            _money(cell)
        row += 1
    rev = history.get('semester_revenue', {})
    _totals_row(ws, row, 'Total',
                {i: rev.get(s) for i, s in enumerate(semesters, start=2)})
    cell = ws.cell(row=row, column=len(semesters) + 2,
                   value=history.get('semester_revenue_grand_total'))
    cell.fill, cell.font, cell.border = GRAND_FILL, Font(bold=True), BOX
    return ws


def _sheet_cover(wb, items, history, generated):
    """First thing you see: what this file is, and the headline numbers."""
    ws = wb.create_sheet('Summary', 0)
    ws.column_dimensions['A'].width = 34
    ws.column_dimensions['B'].width = 26
    ws.cell(row=1, column=1, value='Notati — sales record').font = Font(bold=True, size=16)
    ws.cell(row=2, column=1,
            value=f'Generated {generated:%d %B %Y, %H:%M}').font = Font(size=10, color='6B6B6B')

    gross = sum((i.price or Decimal('0')) for i in items)
    net = sum(((i.price or Decimal('0'))
               * (Decimal(100) - Decimal(i.order.discount_percent or 0)) / Decimal(100))
              for i in items)
    current = Semester.current()
    lines = [
        ('Current semester', current.label if current else '—'),
        ('Chapters sold', len(items)),
        ('Students who bought', len({i.order.user_id for i in items})),
        ('Gross revenue (BHD)', float(gross)),
        ('Net revenue (BHD)', float(round(net, 3))),
        ('', ''),
        ('Hand-kept record (BHD)', (history or {}).get('semester_revenue_grand_total')),
        ('Hand-kept copies', (history or {}).get('grand_total_copies')),
    ]
    row = 4
    for label, value in lines:
        if not label:
            row += 1
            continue
        cell = ws.cell(row=row, column=1, value=label)
        cell.font, cell.fill, cell.border = HEAD_FONT, HEAD_FILL, BOX
        cell = ws.cell(row=row, column=2, value=value)
        cell.border = BOX
        if isinstance(value, float):
            _money(cell)
        row += 1

    row += 1
    for text in (
        'This file is generated from the website\'s database every time you download it.',
        'Never edit it by hand — the next download replaces it completely.',
        'To change something, change it in the admin panel and download again.',
    ):
        cell = ws.cell(row=row, column=1, value=text)
        cell.fill = NOTE_FILL
        row += 1
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
    pending = list(
        Order.objects.filter(status='pending')
        .select_related('user', 'semester').prefetch_related('items').order_by('created_at')
    )
    cancelled = list(
        Order.objects.filter(status='cancelled')
        .select_related('user', 'semester').prefetch_related('items').order_by('created_at')
    )
    # An unlock is "manual" when the student has no paid order for that chapter —
    # access granted from a paid order looks identical otherwise.
    paid_pairs = {(i.order.user_id, i.note_id) for i in items if i.note_id}
    grants = [
        g for g in Access.objects
        .select_related('user', 'note__course', 'granted_by', 'semester')
        .order_by('granted_at')
        if (g.user_id, g.note_id) not in paid_pairs
    ]

    wb = Workbook()
    wb.remove(wb.active)                     # drop the default empty sheet
    _sheet_ledger(wb, items)
    _sheet_by_semester(wb, items, history)
    _sheet_by_course(wb, items)
    _sheet_by_chapter(wb, items)
    _sheet_by_month(wb, items)
    _sheet_orders(wb, 'Pending', pending,
                  'Orders placed but not yet marked paid — what is owed. Never counted as revenue.')
    _sheet_orders(wb, 'Cancelled', cancelled,
                  'Cancelled orders, kept for the record only.')
    _sheet_manual_unlocks(wb, grants)
    if history:
        _sheet_history(wb, history)
    _sheet_cover(wb, items, history, generated)

    buf = BytesIO()
    wb.save(buf)
    return f'Notati sales {generated:%Y-%m-%d}.xlsx', buf.getvalue()
