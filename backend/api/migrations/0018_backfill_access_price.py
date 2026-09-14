"""Freeze a price onto every existing access grant.

Where a paid order exists for that student and chapter, the grant is worth what
was actually paid for that line, discount taken off. Otherwise — a hand-unlock —
it is worth the chapter's list price as it stands today, which is the best
record available: the old price was never written down. From here on every new
grant carries its price from the moment it is made, so this is a one-off.

Only fills blanks, so re-running can never overwrite a frozen price.
"""
from decimal import Decimal
from django.db import migrations


def backfill(apps, schema_editor):
    Access = apps.get_model('api', 'Access')
    OrderItem = apps.get_model('api', 'OrderItem')

    paid = {}
    for item in (OrderItem.objects.filter(order__status='paid', note__isnull=False)
                 .select_related('order')):
        pct = Decimal(item.order.discount_percent or 0)
        net = item.price - (item.price * pct / Decimal(100)).quantize(Decimal('0.001'))
        paid[(item.order.user_id, item.note_id)] = net

    for grant in Access.objects.filter(price__isnull=True).select_related('note'):
        grant.price = paid.get((grant.user_id, grant.note_id), grant.note.price)
        grant.save(update_fields=['price'])


def noop(apps, schema_editor):
    """Nothing to undo — clearing frozen prices would lose information."""


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0017_access_price'),
    ]

    operations = [
        migrations.RunPython(backfill, noop),
    ]
