"""Delete student accounts that signed up but never verified their email.

Runs lazily from auth views already; this command is for manual or scheduled
runs if exact-time cleanup is ever wanted.
"""
from django.core.management.base import BaseCommand

from api import verification


class Command(BaseCommand):
    help = 'Delete inactive student accounts with no valid activation code.'

    def handle(self, *args, **options):
        before = verification.User.objects.filter(is_active=False, role='student').count()
        verification.cleanup_unverified()
        after = verification.User.objects.filter(is_active=False, role='student').count()
        self.stdout.write(self.style.SUCCESS(f'Removed {before - after} unverified account(s).'))
