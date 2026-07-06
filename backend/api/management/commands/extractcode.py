"""Read the fingerprint out of a (possibly leaked) note PDF and trace it.

    python manage.py extractcode /path/to/leaked.pdf

Reads the code from both layers — the PDF metadata and the near-invisible text
tiled across the pages — then looks up the student. Extraction works on any
machine; the student lookup only resolves against the database the command runs
on (so for a real leak, run it on production or paste the printed code into
Admin -> Insights -> Leak trace).
"""
import os

from django.core.management.base import BaseCommand, CommandError
from pypdf import PdfReader

from api import tracing


class Command(BaseCommand):
    help = "Extract the trace code from a note PDF (metadata + on-page) and find the student."

    def add_arguments(self, parser):
        parser.add_argument('path', help='Path to the PDF file to inspect.')

    def handle(self, *args, **options):
        path = options['path']
        if not os.path.exists(path):
            raise CommandError(f'File not found: {path}')
        try:
            reader = PdfReader(path)
        except Exception as e:
            raise CommandError(f'Could not read PDF: {e}')

        codes = []

        # Layer 1 — metadata (easy to strip).
        md = reader.metadata or {}
        meta_code = md.get('/NotatiTrace')
        if not meta_code:
            keywords = md.get('/Keywords') or ''
            if 'notati-trace:' in keywords:
                meta_code = keywords.split('notati-trace:', 1)[1].strip()
        if meta_code:
            self.stdout.write(f'Metadata code : {meta_code}')
            codes.append(meta_code)
        else:
            self.stdout.write(self.style.WARNING('Metadata code : (none — stripped or missing)'))

        # Layer 2 — near-invisible text tiled on the pages (survives metadata wipes).
        onpage = set()
        for page in reader.pages:
            for word in (page.extract_text() or '').split():
                if word.startswith('NT-'):
                    onpage.add(word)
        if onpage:
            self.stdout.write(f'On-page code  : {", ".join(sorted(onpage))}')
            codes.extend(onpage)
        else:
            self.stdout.write(self.style.WARNING('On-page code  : (none found)'))

        if not codes:
            raise CommandError('No fingerprint found — both layers appear to be gone.')

        # Trace each distinct code back to a student.
        self.stdout.write('')
        seen = set()
        for code in codes:
            for m in tracing.find_by_code(code):
                key = (m['user_id'], m['note_id'])
                if key in seen:
                    continue
                seen.add(key)
                self.stdout.write(self.style.SUCCESS(
                    f"{m['code']}  ->  {m.get('name') or '?'} <{m.get('email') or '?'}>"))
                self.stdout.write(f"    note: {m.get('note') or m.get('note_id')}")
                if m.get('last_seen'):
                    self.stdout.write(
                        f"    last download: {m['last_seen']}  |  downloads: {m.get('downloads')}")

        if not seen:
            self.stdout.write('')
            self.stdout.write(self.style.WARNING(
                'Found the code in the file but no matching student on THIS database.'))
            self.stdout.write('If you ran this locally, paste the code above into '
                              'Admin -> Insights -> Leak trace (it queries production).')
