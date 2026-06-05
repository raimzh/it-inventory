from rest_framework import serializers
from .models import Equipment, Employee, EquipmentHistory


class EmployeeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Employee
        fields = ('id', 'full_name', 'department', 'position', 'email', 'created_at')
        read_only_fields = ('id', 'created_at')


class EquipmentHistorySerializer(serializers.ModelSerializer):
    changed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = EquipmentHistory
        fields = ('id', 'action', 'changed_by', 'changed_by_name', 'changed_at', 'changes')

    def get_changed_by_name(self, obj):
        if obj.changed_by:
            return obj.changed_by.get_full_name() or obj.changed_by.username
        return '1С'


class EquipmentSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.SerializerMethodField()
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = Equipment
        fields = (
            'id', 'name', 'category', 'category_display',
            'serial_number', 'inventory_number', 'status', 'status_display',
            'purchase_date', 'warranty_until', 'location', 'notes',
            'assigned_to', 'assigned_to_name',
            'created_by', 'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'created_by', 'created_at', 'updated_at')

    def get_assigned_to_name(self, obj):
        return obj.assigned_to.full_name if obj.assigned_to else None

    def create(self, validated_data):
        validated_data['created_by'] = self.context['request'].user
        equipment = super().create(validated_data)
        EquipmentHistory.objects.create(
            equipment=equipment,
            changed_by=self.context['request'].user,
            action=EquipmentHistory.Action.CREATED,
            changes={},
        )
        return equipment

    def update(self, instance, validated_data):
        instance._changed_by = self.context['request'].user
        return super().update(instance, validated_data)


class EquipmentListSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.SerializerMethodField()
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = Equipment
        fields = (
            'id', 'name', 'category', 'category_display',
            'inventory_number', 'status', 'status_display',
            'location', 'assigned_to', 'assigned_to_name', 'updated_at',
        )

    def get_assigned_to_name(self, obj):
        return obj.assigned_to.full_name if obj.assigned_to else None
