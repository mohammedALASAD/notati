import re
from rest_framework import serializers
from .models import User, Course, Note, NoteFile, Access, Upload, UploadFile, Testimonial


def _signed_url(url):
    """Return a Cloudinary signed URL so delivery works even on untrusted accounts."""
    if not url or 'res.cloudinary.com' not in url:
        return url
    try:
        import cloudinary.utils
        match = re.search(r'/raw/upload/(?:v\d+/)?(.+)$', url)
        if not match:
            return url
        public_id = match.group(1)
        signed, _ = cloudinary.utils.cloudinary_url(
            public_id,
            resource_type='raw',
            sign_url=True,
            attachment=True,
            secure=True,
        )
        return signed
    except Exception:
        return url




class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model = User
        fields = ['email', 'name', 'password', 'college']

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'name', 'role', 'college', 'created_at']
        read_only_fields = ['id', 'created_at']


class UserAdminSerializer(serializers.ModelSerializer):
    uploads_count = serializers.SerializerMethodField()
    access_count  = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'email', 'name', 'role', 'college', 'created_at',
                  'uploads_count', 'access_count']
        read_only_fields = ['id', 'email', 'created_at']

    def get_uploads_count(self, obj):
        return obj.uploads.count()

    def get_access_count(self, obj):
        return obj.access_grants.count()


class CourseSerializer(serializers.ModelSerializer):
    notes_count = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = ['id', 'name', 'college', 'notes_count', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_notes_count(self, obj):
        return obj.notes.count()


def _file_url(file_field, request=None):
    if not file_field:
        return None
    try:
        url = file_field.url
        if 'res.cloudinary.com' in url:
            return _signed_url(url)
        return request.build_absolute_uri(url) if request else url
    except Exception:
        return None


class NoteFileSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = NoteFile
        fields = ['id', 'note', 'label', 'file', 'file_url', 'order', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_file_url(self, obj):
        return _file_url(obj.file, self.context.get('request'))


class UploadFileSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = UploadFile
        fields = ['id', 'upload', 'label', 'file', 'file_url', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_file_url(self, obj):
        return _file_url(obj.file, self.context.get('request'))


class NoteSerializer(serializers.ModelSerializer):
    course_name = serializers.CharField(source='course.name', read_only=True)
    college     = serializers.CharField(source='course.college', read_only=True)
    has_access  = serializers.SerializerMethodField()
    is_free     = serializers.BooleanField(read_only=True)
    files       = serializers.SerializerMethodField()

    class Meta:
        model = Note
        fields = [
            'id', 'course', 'course_name', 'college',
            'chapter_number', 'chapter_title',
            'description', 'price', 'is_free', 'has_access',
            'pdf_file', 'files', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def get_has_access(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        if obj.is_free:
            return True
        return obj.access_grants.filter(user=request.user).exists()

    def get_files(self, obj):
        result = []
        for nf in obj.files.all():
            result.append({
                'id': nf.id,
                'label': nf.label or '',
                'file_url': _file_url(nf.file, self.context.get('request')),
                'filename': nf.file.name.split('/')[-1] if nf.file else '',
            })
        if not result and obj.pdf_file:
            result.append({
                'id': None,
                'label': '',
                'file_url': _signed_url(obj.pdf_file.url),
                'is_legacy': True,
            })
        return result

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if data.get('pdf_file'):
            data['pdf_file'] = _signed_url(data['pdf_file'])
        return data


class NoteAdminSerializer(NoteSerializer):
    class Meta(NoteSerializer.Meta):
        fields = NoteSerializer.Meta.fields + ['created_by']


class AccessSerializer(serializers.ModelSerializer):
    user_email      = serializers.EmailField(source='user.email', read_only=True)
    user_name       = serializers.CharField(source='user.name', read_only=True)
    note_title      = serializers.SerializerMethodField()
    course_name     = serializers.CharField(source='note.course.name', read_only=True)
    chapter_number  = serializers.IntegerField(source='note.chapter_number', read_only=True)
    price           = serializers.DecimalField(source='note.price', max_digits=6,
                                               decimal_places=3, read_only=True)

    class Meta:
        model = Access
        fields = [
            'id', 'user', 'user_email', 'user_name',
            'note', 'note_title', 'course_name', 'chapter_number', 'price',
            'granted_by', 'granted_at',
        ]
        read_only_fields = ['id', 'granted_by', 'granted_at']

    def get_note_title(self, obj):
        return f'Ch.{obj.note.chapter_number}: {obj.note.chapter_title}'

    def validate(self, attrs):
        if Access.objects.filter(user=attrs['user'], note=attrs['note']).exists():
            raise serializers.ValidationError('This student already has access to this note.')
        return attrs

    def create(self, validated_data):
        validated_data['granted_by'] = self.context['request'].user
        return super().create(validated_data)


class UploadSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source='user.email', read_only=True)
    user_name  = serializers.CharField(source='user.name', read_only=True)
    file_url   = serializers.SerializerMethodField()

    class Meta:
        model = Upload
        fields = [
            'id', 'user', 'user_email', 'user_name',
            'file', 'file_url', 'title', 'description',
            'college', 'course_name', 'chapter_number', 'chapter_title',
            'status', 'note', 'created_at',
        ]
        read_only_fields = ['id', 'user', 'status', 'note', 'created_at']

    def get_file_url(self, obj):
        request = self.context.get('request')
        if not obj.file:
            return None
        url = obj.file.url
        if url.startswith('http'):
            return _signed_url(url)
        return request.build_absolute_uri(url) if request else url

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)


class UploadAdminSerializer(UploadSerializer):
    class Meta(UploadSerializer.Meta):
        read_only_fields = ['id', 'user', 'created_at']


class TestimonialSerializer(serializers.ModelSerializer):
    user_name    = serializers.CharField(source='user.name', read_only=True)
    user_college = serializers.CharField(source='user.college', read_only=True)

    class Meta:
        model  = Testimonial
        fields = ['id', 'user_name', 'user_college', 'text', 'course', 'approved', 'created_at']
        read_only_fields = ['id', 'user_name', 'user_college', 'approved', 'created_at']

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)


class TestimonialAdminSerializer(TestimonialSerializer):
    user_email = serializers.EmailField(source='user.email', read_only=True)

    class Meta(TestimonialSerializer.Meta):
        fields = TestimonialSerializer.Meta.fields + ['user_email']
        read_only_fields = ['id', 'user_name', 'user_email', 'user_college', 'created_at']
