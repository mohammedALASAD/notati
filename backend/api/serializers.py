from rest_framework import serializers
from .models import User, Course, Note, Access, Upload


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


class NoteSerializer(serializers.ModelSerializer):
    course_name = serializers.CharField(source='course.name', read_only=True)
    college     = serializers.CharField(source='course.college', read_only=True)
    has_access  = serializers.SerializerMethodField()
    is_free     = serializers.BooleanField(read_only=True)

    class Meta:
        model = Note
        fields = [
            'id', 'course', 'course_name', 'college',
            'chapter_number', 'chapter_title',
            'description', 'price', 'is_free', 'has_access',
            'pdf_file', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def get_has_access(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        if obj.is_free:
            return True
        return obj.access_grants.filter(user=request.user).exists()


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
        if obj.file and request:
            return request.build_absolute_uri(obj.file.url)
        return None

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)


class UploadAdminSerializer(UploadSerializer):
    class Meta(UploadSerializer.Meta):
        read_only_fields = ['id', 'user', 'created_at']
