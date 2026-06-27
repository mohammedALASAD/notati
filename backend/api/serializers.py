import re
from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from .models import (
    User, Course, Note, NoteFile, Access, Upload, UploadFile,
    Testimonial, BagItem, Order, OrderItem, DiscountCode,
)


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
    password = serializers.CharField(write_only=True, min_length=8)
    phone    = serializers.CharField(max_length=20, min_length=6)

    class Meta:
        model = User
        fields = ['email', 'name', 'password', 'college', 'phone']

    def validate_password(self, value):
        # Run Django's configured password validators (length, common, numeric, …)
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value

    def create(self, validated_data):
        # New signups start INACTIVE until they verify their email.
        return User.objects.create_user(is_active=False, **validated_data)


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'name', 'role', 'college', 'phone', 'created_at']
        read_only_fields = ['id', 'created_at']


class UserAdminSerializer(serializers.ModelSerializer):
    uploads_count = serializers.SerializerMethodField()
    access_count  = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'email', 'name', 'role', 'college', 'phone', 'created_at',
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

    def _purchased(self, obj):
        """Read the annotated _user_has_access flag if present, else fall back to DB query."""
        if hasattr(obj, '_user_has_access'):
            return obj._user_has_access
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        return obj.access_grants.filter(user=request.user).exists()

    def _can_access(self, obj):
        """Whether the requesting user may receive direct file URLs for this note."""
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return obj.is_free
        if request.user.role == 'admin':
            return True
        return obj.is_free or self._purchased(obj)

    def get_has_access(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        return obj.is_free or self._purchased(obj)

    def get_files(self, obj):
        # Only hand out the direct (signed) download URL to users who have access.
        # Everyone still gets id/label/filename so the UI can list the contents;
        # the actual bytes are fetched through the access-checked download proxy.
        can = self._can_access(obj)
        result = []
        for nf in obj.files.all():
            result.append({
                'id': nf.id,
                'label': nf.label or '',
                'file_url': _file_url(nf.file, self.context.get('request')) if can else None,
                'filename': nf.file.name.split('/')[-1] if nf.file else '',
            })
        if not result and obj.pdf_file:
            result.append({
                'id': None,
                'label': '',
                'file_url': _signed_url(obj.pdf_file.url) if can else None,
                'is_legacy': True,
            })
        return result

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if data.get('pdf_file'):
            data['pdf_file'] = _signed_url(data['pdf_file']) if self._can_access(instance) else None
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
    user_email    = serializers.EmailField(source='user.email', read_only=True)
    user_name     = serializers.CharField(source='user.name', read_only=True)
    file_url      = serializers.SerializerMethodField()
    auto_delete_at = serializers.SerializerMethodField()

    class Meta:
        model = Upload
        fields = [
            'id', 'user', 'user_email', 'user_name',
            'file', 'file_url', 'title', 'description',
            'college', 'course_name', 'chapter_number', 'chapter_title',
            'status', 'note', 'delete_after', 'auto_delete_at', 'created_at',
        ]
        read_only_fields = ['id', 'user', 'status', 'note', 'auto_delete_at', 'created_at']

    def get_auto_delete_at(self, obj):
        return obj.auto_delete_at().isoformat()

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


class BagItemSerializer(serializers.ModelSerializer):
    note_id       = serializers.IntegerField(source='note.id', read_only=True)
    title         = serializers.CharField(source='note.chapter_title', read_only=True)
    course_name   = serializers.CharField(source='note.course.name', read_only=True)
    chapter_number = serializers.IntegerField(source='note.chapter_number', read_only=True)
    price         = serializers.DecimalField(source='note.price', max_digits=6, decimal_places=3, read_only=True)

    class Meta:
        model  = BagItem
        fields = ['id', 'note_id', 'title', 'course_name', 'chapter_number', 'price', 'added_at']
        read_only_fields = ['id', 'added_at']


class OrderItemSerializer(serializers.ModelSerializer):
    note_id = serializers.IntegerField(source='note.id', read_only=True, allow_null=True)

    class Meta:
        model  = OrderItem
        fields = ['id', 'note_id', 'course_name', 'chapter_number', 'chapter_title', 'price']
        read_only_fields = fields


class OrderSerializer(serializers.ModelSerializer):
    items       = OrderItemSerializer(many=True, read_only=True)
    user_email  = serializers.EmailField(source='user.email', read_only=True)
    user_name   = serializers.CharField(source='user.name', read_only=True)
    item_count  = serializers.SerializerMethodField()

    class Meta:
        model  = Order
        fields = ['id', 'user', 'user_email', 'user_name', 'status',
                  'subtotal', 'discount_code', 'discount_percent', 'total',
                  'note', 'item_count', 'items', 'created_at', 'paid_at']
        read_only_fields = ['id', 'user', 'user_email', 'user_name',
                            'subtotal', 'discount_code', 'discount_percent', 'total',
                            'item_count', 'items', 'created_at', 'paid_at']

    def get_item_count(self, obj):
        return obj.items.count()


class DiscountCodeSerializer(serializers.ModelSerializer):
    uses_count = serializers.SerializerMethodField()

    def get_uses_count(self, obj):
        return obj.uses_count()

    class Meta:
        model  = DiscountCode
        fields = ['id', 'code', 'percent', 'active', 'valid_from', 'valid_until',
                  'max_uses', 'uses_count', 'created_at']
        read_only_fields = ['id', 'uses_count', 'created_at']

    def validate_percent(self, value):
        if not 1 <= value <= 100:
            raise serializers.ValidationError('Percent must be between 1 and 100.')
        return value

    def validate_code(self, value):
        value = (value or '').strip().upper()
        if not value:
            raise serializers.ValidationError('Code is required.')
        if not re.match(r'^[A-Z0-9_-]{3,40}$', value):
            raise serializers.ValidationError('Use 3–40 letters, numbers, hyphens or underscores.')
        qs = DiscountCode.objects.filter(code=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('That code already exists.')
        return value

    def validate(self, attrs):
        vf = attrs.get('valid_from')
        vu = attrs.get('valid_until')
        if vf and vu and vu < vf:
            raise serializers.ValidationError('“Valid until” must be after “valid from”.')
        return attrs
