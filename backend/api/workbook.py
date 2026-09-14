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
from collections import namedtuple
from decimal import Decimal
from io import BytesIO
from pathlib import Path

from django.utils import timezone

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from django.db.models import Count

from .models import Access, Course, OrderItem, Semester

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


def _history_copies(entry):
    """The numeric copies in one semester's course row — 'No Pay' and 'Summer'
    are text markers, not zeros, and stay out of the sum."""
    return {name: int(v) for name, v in (entry.get('copies') or {}).items()
            if isinstance(v, (int, float)) and v > 0}


def history_copies_for(label):
    """Copies the hand-kept record has for one semester, or None when it kept
    none for that term (the website's own semesters, and the summers)."""
    for entry in _load_history().get('course_rows', []):
        if entry.get('semester') == label:
            return sum(_history_copies(entry).values())
    return None


def history_for_insights(semester):
    """What the hand-kept record says, shaped for the Insights Sales page —
    one semester at a time, or all of it when `semester` is None.

    The record kept copies per course per semester, revenue per semester, and
    a lifetime value per course; it never kept revenue per course per semester.
    So a single old semester lists its courses with copies but no revenue and
    carries the term's revenue as one figure, while 'all semesters' can put a
    value on every course. Returns None when the record has nothing to say —
    the website's own semesters — so the page stays exactly as it was."""
    history = _load_history()
    if not history:
        return None
    revenue_by_sem = history.get('semester_revenue') or {}

    # Line each old course up with today's catalogue, so it groups under the
    # same name and college as the website's own sales for that course.
    catalogue = {}
    for name, college, chapters in (Course.objects.annotate(n=Count('notes'))
                                    .values_list('name', 'college', 'n')):
        key = _course_key(name)
        if key not in catalogue or chapters:
            catalogue[key] = (name, college)

    def college_for(key):
        if key in catalogue and catalogue[key][1]:
            return catalogue[key][1]
        # A course no longer in the catalogue: the same letters (ITCY, LAW…)
        # as one that is, so it lands in the right college rather than nowhere.
        letters = re.match(r'[A-Z]+', key)
        if letters:
            for other, (_, college) in catalogue.items():
                if college and other.startswith(letters.group()):
                    return college
        return 'Other courses'

    def row(name, sales, revenue):
        key = _course_key(name)
        return {
            'college': college_for(key),
            'course_name': catalogue[key][0] if key in catalogue else name,
            'sales': sales,
            'revenue': None if revenue is None else f'{float(revenue):.3f}',
        }

    if semester is None:
        copies = history.get('course_total_copies') or {}
        values = history.get('course_total_value') or {}
        rows = [row(name, int(copies.get(name) or 0), values.get(name) or 0)
                for name in history.get('courses', []) if copies.get(name)]
        if not rows:
            return None
        by_course = sum(float(r['revenue']) for r in rows)
        total = float(history.get('semester_revenue_grand_total')
                      or sum(revenue_by_sem.values()))
        return {
            'semester': None,
            'semesters': [label for label, value in revenue_by_sem.items() if value],
            'rows': rows,
            'copies': int(history.get('grand_total_copies') or sum(copies.values())),
            'revenue': f'{total:.3f}',
            'revenue_by_course': True,
            # The record's monthly grid ran ahead of its course grid — the
            # summers were only ever tracked monthly. Reported, not hidden.
            'unallocated': f'{max(total - by_course, 0):.3f}',
        }

    label = semester.label
    entry = next((e for e in history.get('course_rows', [])
                  if e.get('semester') == label), None)
    revenue = float(revenue_by_sem.get(label) or 0)
    if entry is None and not revenue:
        return None
    copies = _history_copies(entry) if entry else {}
    return {
        'semester': label,
        'semesters': [label],
        'rows': [row(name, n, None) for name, n in copies.items()],
        'copies': sum(copies.values()) if entry else None,
        'revenue': f'{revenue:.3f}',
        'revenue_by_course': False,
        'unallocated': f'{revenue:.3f}',
    }


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


Sale = namedtuple('Sale', 'semester course value when student email college '
                          'chapter_number chapter_title list_price ref paid')


def _net(item):
    """A line's share of its order's discount taken off, so revenue is what
    actually landed rather than list price."""
    price = item.price or Decimal('0')
    pct = Decimal(item.order.discount_percent or 0)
    return price - (price * pct / Decimal(100)).quantize(Decimal('0.001'))


def _collect_sales():
    """Every copy that went out, counted the same way the Insights Sales page
    counts it: one per access grant on a paid chapter.

    That matters — access is granted both by confirming an order and by
    unlocking a chapter by hand, and a hand-unlock is still a copy in someone's
    possession. Counting paid order lines alone missed every manual grant.

    Where a paid order exists for that student and chapter, the sale is worth
    what they actually paid, discount included; otherwise it is worth the list
    price, which is what the Sales page shows for a hand-granted unlock.

    Paid order lines whose access row has since gone — the chapter was deleted,
    or access was revoked — are added afterwards so a past sale is never lost.
    """
    items = list(OrderItem.objects
                 .filter(order__status='paid')
                 .select_related('order', 'order__user', 'order__semester'))
    # Only lines that still point at a chapter can be matched to an access row.
    # A line whose chapter was deleted keeps its snapshotted course and price, so
    # it is counted on its own below rather than being lost.
    paid = {(i.order.user_id, i.note_id): i for i in items if i.note_id}

    sales, seen = [], set()
    grants = (Access.objects
              .select_related('user', 'note__course', 'semester')
              .order_by('granted_at'))
    for grant in grants:
        note = grant.note
        if not note or note.price <= 0:
            continue                      # free chapters are not sales
        item = paid.get((grant.user_id, grant.note_id))
        # The access grant IS the sale, so its own term and date decide where the
        # sale is filed — the same stamps the Insights Sales page reads. An order
        # only says what was paid for it, and the two can differ: an order placed
        # near the end of a term is often confirmed after the next one has begun.
        semester, when = grant.semester, grant.granted_at
        if item:
            seen.add((grant.user_id, grant.note_id))
            value, ref = _net(item), (item.order.code or f'#{item.order_id}')
            semester = semester or item.order.semester
            when = when or item.order.paid_at or item.order.created_at
        else:
            # The price frozen on the grant when it was made. Older rows had no
            # such record and fall back to the list price as it stands today.
            value = grant.price if grant.price is not None else note.price
            ref = 'unlocked by hand'
        sales.append(Sale(
            semester=semester.label if semester else 'Unassigned',
            course=note.course.name if note.course else '(unknown)',
            value=value, when=when,
            student=grant.user.name, email=grant.user.email,
            college=grant.user.college or '',
            chapter_number=str(note.chapter_number), chapter_title=note.chapter_title,
            list_price=note.price, ref=ref, paid=bool(item),
        ))

    # Sales whose chapter has since been deleted. The order line keeps a snapshot
    # of the course and price, so the sale survives the chapter going away.
    #
    # Deliberately only those: a line whose chapter still exists but has no access
    # row means access was revoked, and the student no longer holds that copy.
    # The Sales page excludes those, so counting them here would put the two out
    # of step — which is the whole point of counting grants in the first place.
    for item in items:
        if item.note_id is not None or (item.price or 0) <= 0:
            continue
        order = item.order
        sales.append(Sale(
            semester=order.semester.label if order.semester else 'Unassigned',
            course=item.course_name or '(unknown)',
            value=_net(item), when=order.paid_at or order.created_at,
            student=order.user.name, email=order.user.email,
            college=order.user.college or '',
            chapter_number=item.chapter_number, chapter_title=item.chapter_title,
            list_price=item.price, ref=order.code or f'#{order.pk}', paid=True,
        ))

    sales.sort(key=lambda s: (s.when is None, s.when))
    return sales


# ── Gathering ─────────────────────────────────────────────────────────────────

def _semester_labels(history):
    """Every semester, in order — the seeded list, plus any label that only the
    old record knows about."""
    labels = [s.label for s in Semester.objects.all()]
    for label in history.get('semesters', []):
        if label not in labels:
            labels.append(label)
    return labels


def _course_columns(history, sales):
    """Course columns in the order the old record had them, with anything new
    appended. The newest name seen for a code is the one shown.

    Every course with at least one chapter gets a column, not just the ones
    that have sold — add a course and its first chapter and it is in the file
    straight away, empty until its first sale. The old record worked the same
    way, listing courses before they were on sale."""
    names, order = {}, []

    def register(name):
        key = _course_key(name)
        if key not in names:
            names[key] = name
            order.append(key)
        return key

    for name in history.get('courses', []):
        register(name)
    live = set()
    # A course is in the record once it has a chapter to sell. Empty shells —
    # typos, tests, duplicates left behind — stay out until they have content.
    for name in (Course.objects.filter(notes__isnull=False).distinct()
                 .values_list('name', flat=True)):
        key = register(name)
        names[key] = name                   # the catalogue name is today's name
        live.add(key)
    # Finally anything an order still remembers whose course has since been
    # deleted — an old sale must never lose its column.
    for sale in sales:
        key = register(sale.course)
        if key not in live:
            names.setdefault(key, sale.course)
    return order, names


# ── Sheet: Courses ────────────────────────────────────────────────────────────

def _sheet_courses(wb, sales, history, keys, names, ledger_last):
    ws = wb.create_sheet('Courses')
    labels = _semester_labels(history)

    # Hand-kept copies, keyed the same way as the live ones.
    hist = {}
    for entry in history.get('course_rows', []):
        for name, value in entry['copies'].items():
            hist[(entry['semester'], _course_key(name))] = value
    hist_value = {_course_key(n): v
                  for n, v in (history.get('course_total_value') or {}).items()}

    live_copies = {}
    for sale in sales:
        key = _course_key(sale.course)
        if sale.semester not in labels:
            labels.append(sale.semester)
        live_copies[(sale.semester, key)] = live_copies.get((sale.semester, key), 0) + 1

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

    first, last_col = row, get_column_letter(len(keys) + 1)
    for label in labels:
        _put(ws, row, 1, label, fill=LABEL_FILL, font=Font(size=10))
        for idx, key in enumerate(keys, start=2):
            old = hist.get((label, key))
            new = live_copies.get((label, key), 0)
            if isinstance(old, str) and not new:
                # 'No Pay' / 'Summer' — not on sale, not offered. Never a zero.
                _put(ws, row, idx, old, font=GREY)
                continue
            total = (old if isinstance(old, (int, float)) else 0) + new
            _put(ws, row, idx, total if (old is not None or new) else None)
        # Live row total, so editing a cell updates it. SUM skips the text
        # markers by itself, which is exactly what we want.
        _put(ws, row, len(keys) + 2, f'=SUM(B{row}:{last_col}{row})',
             font=Font(bold=True, size=10))
        row += 1
    last = row - 1

    _put(ws, row, 1, 'Total copies sold', fill=TOTAL_FILL, font=HEAD_FONT)
    for idx in range(2, len(keys) + 2):
        col = get_column_letter(idx)
        _put(ws, row, idx, f'=SUM({col}{first}:{col}{last})',
             fill=TOTAL_FILL, font=HEAD_FONT)
    # Sums the grid itself rather than the subtotals above it — one less layer
    # to go wrong, and still right if a subtotal is ever overtyped.
    _put(ws, row, len(keys) + 2, f'=SUM(B{first}:{last_col}{last})',
         fill=COUNT_FILL, font=Font(bold=True, size=10))
    row += 1

    # Value = the hand-kept figure, fixed, plus a live SUMIF over the ledger's
    # Value column for this course. The ledger carries what each copy was
    # actually worth when it went out — old website sales at the old price,
    # new ones at today's, discounts taken off — so a price change never
    # rewrites history, and adding a ledger row moves this cell.
    _put(ws, row, 1, 'Total value of copies sold', fill=TOTAL_FILL, font=HEAD_FONT)
    for idx, key in enumerate(keys, start=2):
        fixed = float(hist_value.get(key) or 0)
        if ledger_last >= 2:
            name = names[key].replace('"', '""')
            live = (f"SUMIF('Sales ledger'!$G$2:$G${ledger_last},\"{name}\","
                    f"'Sales ledger'!$K$2:$K${ledger_last})")
            value = f'={fixed}+{live}' if fixed else f'={live}'
        else:
            value = round(fixed, 3) or None
        _put(ws, row, idx, value, fill=TOTAL_FILL, font=HEAD_FONT, money=True)
    _put(ws, row, len(keys) + 2, f'=SUM(B{row}:{last_col}{row})',
         fill=GRAND_FILL, font=Font(bold=True, size=10), money=True)
    return ws


# ── Sheet: semsters ───────────────────────────────────────────────────────────

def _month_index(sales):
    """Revenue per (semester, month-number-within-that-semester).

    The old record counted 'Month 1..6' inside a term rather than calendar
    months, so the website's sales are numbered the same way: the first calendar
    month a semester sold anything is Month 1, and gaps stay gaps."""
    by_sem = {}
    for sale in sales:
        if not sale.when:
            continue
        stamp = timezone.localtime(sale.when)
        by_sem.setdefault(sale.semester, {})
        key = (stamp.year, stamp.month)
        by_sem[sale.semester][key] = by_sem[sale.semester].get(key, Decimal('0')) + sale.value

    out = {}
    for label, months in by_sem.items():
        first = min(months)
        for (year, month), value in months.items():
            offset = (year - first[0]) * 12 + (month - first[1]) + 1
            out[(label, offset)] = out.get((label, offset), Decimal('0')) + value
    return out


def _sheet_semesters(wb, sales, history):
    ws = wb.create_sheet('semsters')
    labels = _semester_labels(history)

    hist = {}
    for entry in history.get('month_rows', []):
        number = int(re.sub(r'\D', '', entry['month']) or 0)
        for label, value in entry['revenue'].items():
            hist[(label, number)] = value

    live = _month_index(sales)
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

    first, last_col = row, get_column_letter(len(labels) + 1)
    for number in range(1, months + 1):
        _put(ws, row, 1, f'Month {number}', fill=LABEL_FILL, font=Font(size=10))
        for idx, label in enumerate(labels, start=2):
            old = hist.get((label, number))
            new = live.get((label, number))
            if old is None and new is None:
                _put(ws, row, idx, None)          # a month with no sales stays blank
                continue
            _put(ws, row, idx, round(float(old or 0) + float(new or 0), 3), money=True)
        row += 1
    last = row - 1

    total_row = row
    _put(ws, row, 1, 'Total', fill=TOTAL_FILL, font=HEAD_FONT)
    for idx in range(2, len(labels) + 2):
        col = get_column_letter(idx)
        _put(ws, row, idx, f'=SUM({col}{first}:{col}{last})',
             fill=TOTAL_FILL, font=HEAD_FONT, money=True)
    _put(ws, row, len(labels) + 2, f'=SUM(B{first}:{last_col}{last})',
         fill=GRAND_FILL, font=Font(bold=True, size=10), money=True)
    row += 1

    # Per month = the term's total over the months it actually sold in, and the
    # figure on the end is the average of those — the same way the old record
    # worked it out.
    _put(ws, row, 1, 'Per month', fill=TOTAL_FILL, font=HEAD_FONT)
    for idx in range(2, len(labels) + 2):
        col = get_column_letter(idx)
        _put(ws, row, idx,
             f'=IF(COUNT({col}{first}:{col}{last})=0,"",'
             f'{col}{total_row}/COUNT({col}{first}:{col}{last}))',
             fill=TOTAL_FILL, font=HEAD_FONT, money=True)
    _put(ws, row, len(labels) + 2,
         f'=IF(COUNT(B{row}:{last_col}{row})=0,"",AVERAGE(B{row}:{last_col}{row}))',
         font=Font(bold=True, size=10), money=True)
    return ws


# ── Sheet: Sales ledger ───────────────────────────────────────────────────────

def _sheet_ledger(wb, sales, names):
    """The detail the old file never had: who has each chapter, and how it
    reached them — bought, or unlocked by hand.

    The Courses sheet sums this sheet's Value column with SUMIF, so the course
    written here is the same display name that heads the Courses column, and
    the function returns the last data row for those formulas to point at."""
    ws = wb.create_sheet('Sales ledger')
    heads = ['Date', 'Semester', 'How', 'Student', 'Email', 'College',
             'Course', 'Ch.', 'Chapter title', 'List price', 'Value', 'Reference']
    for idx, (head, width) in enumerate(
            zip(heads, [12, 20, 15, 22, 26, 16, 20, 6, 28, 11, 10, 18]), start=1):
        _put(ws, 1, idx, head, fill=LABEL_FILL, font=HEAD_FONT)
        ws.column_dimensions[get_column_letter(idx)].width = width
    ws.freeze_panes = 'A2'

    row = 2
    for sale in sales:
        values = [
            timezone.localtime(sale.when).strftime('%Y-%m-%d') if sale.when else '',
            sale.semester,
            'Paid order' if sale.paid else 'Unlocked by hand',
            sale.student, sale.email, sale.college,
            names.get(_course_key(sale.course), sale.course),
            sale.chapter_number, sale.chapter_title,
            float(sale.list_price or 0), float(sale.value or 0), sale.ref,
        ]
        for idx, value in enumerate(values, start=1):
            cell = _put(ws, row, idx, value, money=idx in (10, 11))
            if idx == 3 and not sale.paid:
                cell.font = GREY
        row += 1

    _put(ws, row, 1, 'Total', fill=TOTAL_FILL, font=HEAD_FONT)
    for idx in range(2, 13):
        _put(ws, row, idx, None, fill=TOTAL_FILL)
    if row > 2:
        _put(ws, row, 9, f'=COUNTA(I2:I{row - 1})&" chapters"',
             fill=TOTAL_FILL, font=HEAD_FONT)
        _put(ws, row, 10, f'=SUM(J2:J{row - 1})', fill=TOTAL_FILL, font=HEAD_FONT,
             money=True)
        _put(ws, row, 11, f'=SUM(K2:K{row - 1})', fill=TOTAL_FILL, font=HEAD_FONT,
             money=True)
    return row - 1          # last data row; 1 when there are no sales at all


# ── Entry point ───────────────────────────────────────────────────────────────

def build_sales_workbook():
    """Returns (filename, xlsx bytes)."""
    generated = timezone.localtime()
    history = _load_history()
    sales = _collect_sales()

    keys, names = _course_columns(history, sales)

    wb = Workbook()
    wb.remove(wb.active)
    _sheet_semesters(wb, sales, history)
    ledger_last = _sheet_ledger(wb, sales, names)
    _sheet_courses(wb, sales, history, keys, names, ledger_last)
    # Tab order the way the old file had it, with the detail sheet last.
    wb.move_sheet('Sales ledger', offset=1)

    buf = BytesIO()
    wb.save(buf)
    return f'Notati sales {generated:%Y-%m-%d}.xlsx', buf.getvalue()
