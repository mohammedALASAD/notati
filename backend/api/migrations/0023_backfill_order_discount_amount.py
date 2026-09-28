from decimal import Decimal, ROUND_HALF_UP

from django.db import migrations


def backfill(apps, schema_editor):
    """Give every past discounted order the money figure it never stored.

    Percent was the only record before flat-amount codes existed, so the amount
    is derived from it — the same sum the order's own total already reflects."""
    Order = apps.get_model('api', 'Order')
    for pk, subtotal, percent in (Order.objects
                                  .filter(discount_percent__gt=0)
                                  .values_list('pk', 'subtotal', 'discount_percent')):
        off = (Decimal(subtotal or 0) * Decimal(percent) / Decimal(100)).quantize(
            Decimal('0.001'), rounding=ROUND_HALF_UP)
        Order.objects.filter(pk=pk).update(discount_amount=off)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0022_discount_kinds_and_limits'),
    ]

    operations = [migrations.RunPython(backfill, noop)]
