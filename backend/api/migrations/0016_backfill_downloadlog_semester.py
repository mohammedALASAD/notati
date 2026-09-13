"""File every open recorded before semesters existed under Semester 10 (Summer)
— the term the website was running in when they happened.

Only fills blanks, so re-running can never move a row that is already filed.
"""
from django.db import migrations

CURRENT_POSITION = 10


def backfill(apps, schema_editor):
    Semester = apps.get_model('api', 'Semester')
    DownloadLog = apps.get_model('api', 'DownloadLog')
    current = Semester.objects.filter(position=CURRENT_POSITION).first()
    if current:
        DownloadLog.objects.filter(semester__isnull=True).update(semester=current)


def noop(apps, schema_editor):
    """Nothing to undo — clearing the stamps would lose information."""


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0015_downloadlog_semester'),
    ]

    operations = [
        migrations.RunPython(backfill, noop),
    ]
