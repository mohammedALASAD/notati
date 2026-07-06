"""Trace a leaked note back to the student who downloaded it.

Read the fingerprint code off the leaked PDF (it's in the file's metadata under
'Keywords'/'NotatiTrace', and tiled invisibly across every page) and run:

    python manage.py wholeaked ABC12XYZ
"""
from django.core.management.base import BaseCommand

from api import tracing


class Command(BaseCommand):
    help = "Trace a leaked note's fingerprint code back to the student who downloaded it."

    def add_arguments(self, parser):
        parser.add_argument('code', help='The trace code found in the leaked PDF.')

    def handle(self, *args, **options):
        code = options['code']
        matches = tracing.find_by_code(code)
        if not matches:
            self.stdout.write(self.style.WARNING(f'No student found for code {code!r}.'))
            return
        for m in matches:
            self.stdout.write(self.style.SUCCESS(
                f"{m['code']}  ->  {m.get('name') or '?'} <{m.get('email') or '?'}>"))
            self.stdout.write(f"    note: {m.get('note') or m.get('note_id')}")
            if m.get('last_seen'):
                self.stdout.write(
                    f"    last download: {m['last_seen']}  |  downloads: {m.get('downloads')}")
            self.stdout.write(f"    source: {m.get('source')}")
