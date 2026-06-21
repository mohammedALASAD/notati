from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, Course, Note, Access, Upload, Order, OrderItem


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ['email']
    list_display = ['email', 'name', 'role', 'college', 'created_at']
    list_filter = ['role', 'college']
    search_fields = ['email', 'name']
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Profile', {'fields': ('name', 'role', 'college')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser')}),
    )
    add_fieldsets = (
        (None, {'fields': ('email', 'name', 'password1', 'password2', 'role', 'college')}),
    )


@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    list_display = ['name', 'college', 'created_at']
    search_fields = ['name', 'college']


@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    list_display = ['course', 'chapter_number', 'chapter_title', 'price', 'created_at']
    list_filter = ['course']
    search_fields = ['chapter_title', 'course__name']


@admin.register(Access)
class AccessAdmin(admin.ModelAdmin):
    list_display = ['user', 'note', 'granted_by', 'granted_at']
    list_filter = ['note__course']
    search_fields = ['user__email', 'note__chapter_title']


@admin.register(Upload)
class UploadAdmin(admin.ModelAdmin):
    list_display = ['user', 'title', 'status', 'created_at']
    list_filter = ['status']
    search_fields = ['user__email', 'title']


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'status', 'total', 'created_at', 'paid_at']
    list_filter = ['status']
    search_fields = ['user__email']
    inlines = [OrderItemInline]
