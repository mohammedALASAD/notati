from django.db import migrations


def backfill(apps, schema_editor):
    """Date every existing chapter from the newest file attached to it, falling
    back to the day it was published. Uploading a file is the change that
    matters most, and its timestamp is the only honest record we kept of one."""
    Note = apps.get_model('api', 'Note')
    NoteFile = apps.get_model('api', 'NoteFile')

    newest = {}
    for note_id, created in NoteFile.objects.values_list('note_id', 'created_at'):
        if note_id and (note_id not in newest or created > newest[note_id]):
            newest[note_id] = created

    for pk, created_at in Note.objects.values_list('pk', 'created_at'):
        stamp = newest.get(pk)
        if stamp is None or stamp < created_at:
            stamp = created_at
        # .update() writes the value as given; saving the instance would let
        # auto_now overwrite every chapter with today, which is the opposite
        # of what this migration is for.
        Note.objects.filter(pk=pk).update(updated_at=stamp)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0020_note_updated_at'),
    ]

    operations = [migrations.RunPython(backfill, noop)]
