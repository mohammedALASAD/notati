from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0018_backfill_access_price'),
    ]

    operations = [
        migrations.AddField(
            model_name='downloadlog',
            name='kind',
            field=models.CharField(
                choices=[('open', 'Open'), ('preview', 'Preview')],
                db_index=True, default='open', max_length=8),
        ),
    ]
