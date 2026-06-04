from django.core.management.base import BaseCommand
from api.models import User, Course, Note


COURSES = [
    ('MGMT 233', 'College of Business Administration', [
        (1, 'What is Management',     0,    'The four functions every manager does, in plain language.'),
        (2, 'Organisational Structure', 0.5, 'Flat vs. tall, centralised vs. decentralised — exam-ready.'),
        (3, 'Leadership Styles',      1,    'Autocratic, democratic, laissez-faire — comparison table included.'),
        (4, 'Motivation Theories',    1,    'Internal vs. external motivation, broken down with everyday examples.'),
    ]),
    ('CS 220', 'College of Information Technology', [
        (1, 'Introduction to Data Structures', 0,    'What data structures actually are and why they matter.'),
        (2, 'Arrays and Linked Lists',         0.5,  'Side-by-side comparison of time complexity and memory.'),
        (3, 'Stacks and Queues',               0.5,  'LIFO and FIFO — real-world analogies and common exam traps.'),
        (4, 'Sorting Algorithms',              1,    'Big-O for each algorithm, best/worst/average cases.'),
        (6, 'Trees and Graphs',                0.5,  'How to picture a binary tree and walk a graph without re-reading.'),
    ]),
    ('STAT 201', 'College of Science', [
        (1, 'Introduction to Statistics',   0,   'Population vs. sample, types of data — the essentials.'),
        (2, 'Descriptive Statistics',        0.5, 'Mean, median, mode — and when each one lies.'),
        (3, 'Probability Distributions',     1,   'Normal, binomial, Poisson with worked examples.'),
        (5, 'Probability Rules',             1,   'Conditional, joint, marginal, and Bayes — exam night edition.'),
    ]),
    ('ACC 112', 'College of Business Administration', [
        (1, 'Introduction to Accounting', 0,   'The accounting equation and why debits/credits exist.'),
        (2, 'The Accounting Cycle',        0.5, 'Journals, ledger, trial balance, financial statements.'),
        (3, 'Financial Statements',        1,   'Income statement, balance sheet, cash flow — connected.'),
    ]),
]


class Command(BaseCommand):
    help = 'Seed demo courses, notes, and an admin user'

    def handle(self, *args, **options):
        # Admin user
        if not User.objects.filter(email='admin@notati.com').exists():
            User.objects.create_superuser(
                email='admin@notati.com',
                password='admin123',
                name='Admin',
            )
            self.stdout.write('  Created admin@notati.com')

        # Demo student
        if not User.objects.filter(email='mariam@uob.edu.bh').exists():
            User.objects.create_user(
                email='mariam@uob.edu.bh',
                password='demo1234',
                name='Mariam Al-Khalifa',
                college='College of Business Administration',
            )
            self.stdout.write('  Created mariam@uob.edu.bh')

        admin = User.objects.get(email='admin@notati.com')

        for course_name, college, chapters in COURSES:
            course, _ = Course.objects.get_or_create(
                name=course_name,
                defaults={'college': college},
            )
            for num, title, price, desc in chapters:
                Note.objects.get_or_create(
                    course=course,
                    chapter_number=num,
                    defaults={
                        'chapter_title': title,
                        'description':   desc,
                        'price':         price,
                        'created_by':    admin,
                    },
                )

        self.stdout.write(self.style.SUCCESS(
            f'Seeded {Course.objects.count()} courses, {Note.objects.count()} notes.'
        ))
