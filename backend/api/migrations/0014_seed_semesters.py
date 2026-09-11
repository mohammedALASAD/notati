"""Seed the semester list the sales record has always used, and file every
existing order and manual unlock under Semester 10 (Summer) — the term the
website's sales were taken in.

Semester 11 is given a start date of 13 Sep 2026 so the switch happens on its
own that morning; every other semester is a plain label with no calendar
attached. Later semesters are added from the admin as they come.
"""
import datetime
from django.db import migrations

# Matches the semester column headings in the hand-kept Notes_selling record.
SEMESTERS = [
    (1,  'Semester 1',           False),
    (2,  'Semester 2',           False),
    (3,  'Semester 3',           False),
    (4,  'Semester 4 (Summer)',  True),
    (5,  'Semester 5',           False),
    (6,  'Semester 6',           False),
    (7,  'Semester 7 (Summer)',  True),
    (8,  'Semester 8',           False),
    (9,  'Semester 9',           False),
    (10, 'Semester 10 (Summer)', True),
    (11, 'Semester 11',          False),
    (12, 'Semester 12',          False),
]
CURRENT_POSITION = 10                          # where the website's sales belong
NEXT_START = datetime.date(2026, 9, 13)        # Semester 11 begins


def seed(apps, schema_editor):
    Semester = apps.get_model('api', 'Semester')
    Order    = apps.get_model('api', 'Order')
    Access   = apps.get_model('api', 'Access')

    for position, label, is_summer in SEMESTERS:
        Semester.objects.update_or_create(
            position=position,
            defaults={
                'label': label,
                'is_summer': is_summer,
                'is_current': position == CURRENT_POSITION,
                'starts_on': NEXT_START if position == CURRENT_POSITION + 1 else None,
            },
        )

    current = Semester.objects.filter(position=CURRENT_POSITION).first()
    if current:
        # Everything recorded so far was sold in this term. Only fills blanks, so
        # re-running can never move an order that has already been filed.
        Order.objects.filter(semester__isnull=True).update(semester=current)
        Access.objects.filter(semester__isnull=True).update(semester=current)


def unseed(apps, schema_editor):
    Semester = apps.get_model('api', 'Semester')
    Semester.objects.filter(position__in=[p for p, _, _ in SEMESTERS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0013_semester_access_semester_order_semester'),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
