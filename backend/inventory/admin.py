from django.contrib import admin
from .models import Equipment, Employee, EquipmentHistory


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'department', 'position', 'email')
    search_fields = ('full_name', 'department', 'email')


@admin.register(Equipment)
class EquipmentAdmin(admin.ModelAdmin):
    list_display = ('name', 'inventory_number', 'category', 'status', 'assigned_to', 'location')
    list_filter = ('category', 'status')
    search_fields = ('name', 'inventory_number', 'serial_number')
    raw_id_fields = ('assigned_to',)


@admin.register(EquipmentHistory)
class EquipmentHistoryAdmin(admin.ModelAdmin):
    list_display = ('equipment', 'action', 'changed_by', 'changed_at')
    list_filter = ('action',)
    readonly_fields = ('equipment', 'changed_by', 'changed_at', 'action', 'changes')
