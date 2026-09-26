from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0019_downloadlog_kind'),
    ]

    operations = [
        migrations.AddField(
            model_name='note',
            name='updated_at',
            field=models.DateTimeField(auto_now=True, null=True),
        ),
    ]
