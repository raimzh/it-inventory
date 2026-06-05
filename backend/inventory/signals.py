from django.db.models.signals import pre_save
from django.dispatch import receiver
from .models import Equipment, EquipmentHistory

_TRACKED_FIELDS = [
    'name', 'category', 'serial_number', 'inventory_number',
    'status', 'purchase_date', 'warranty_until', 'location',
    'notes', 'assigned_to_id',
]


@receiver(pre_save, sender=Equipment)
def track_equipment_changes(sender, instance, **kwargs):
    if not instance.pk:
        return
    try:
        old = Equipment.objects.get(pk=instance.pk)
    except Equipment.DoesNotExist:
        return

    changes = {}
    for field in _TRACKED_FIELDS:
        old_val = getattr(old, field)
        new_val = getattr(instance, field)
        if old_val != new_val:
            changes[field] = {'old': str(old_val) if old_val is not None else None,
                              'new': str(new_val) if new_val is not None else None}

    if not changes:
        return

    assigned_changed = 'assigned_to_id' in changes
    if assigned_changed and instance.assigned_to_id:
        action = EquipmentHistory.Action.ASSIGNED
    elif assigned_changed and not instance.assigned_to_id:
        action = EquipmentHistory.Action.UNASSIGNED
    else:
        action = EquipmentHistory.Action.UPDATED

    user = getattr(instance, '_changed_by', None)
    EquipmentHistory.objects.create(
        equipment=old,
        changed_by=user,
        action=action,
        changes=changes,
    )
