"""The hand-kept sales record from before the website (sales_history.json).

Kept apart from workbook.py, which builds the .xlsx and needs openpyxl: the
Insights pages read this record on almost every load, and they should not pay
for importing a spreadsheet library they never use. workbook.py re-exports
everything here, so either import path works.
"""
import json
import os
import re
from pathlib import Path

from django.db.models import Count

from .models import Course

HISTORY_PATH = Path(__file__).resolve().parent / 'sales_history.json'

# Parsed once and reused until the file changes on disk (a redeploy), instead
# of being re-read and re-parsed for every semester on every request.
_cache = {'mtime': None, 'data': {}}


def _load_history():
    try:
        mtime = os.path.getmtime(HISTORY_PATH)
    except OSError:
        return {}
    if _cache['mtime'] != mtime:
        try:
            with open(HISTORY_PATH, encoding='utf-8') as fh:
                _cache['data'] = json.load(fh)
        except (OSError, ValueError):
            _cache['data'] = {}
        _cache['mtime'] = mtime
    return _cache['data']


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
