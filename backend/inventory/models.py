from django.db import models
from django.conf import settings


class Employee(models.Model):
    full_name = models.CharField(max_length=200, verbose_name='ФИО')
    department = models.CharField(max_length=200, blank=True, verbose_name='Отдел')
    position = models.CharField(max_length=200, blank=True, verbose_name='Должность')
    email = models.EmailField(blank=True, verbose_name='Email')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Сотрудник'
        verbose_name_plural = 'Сотрудники'
        ordering = ['full_name']

    def __str__(self):
        return self.full_name


class Equipment(models.Model):
    class Category(models.TextChoices):
        SERVER = 'server', 'Сервер'
        PC = 'pc', 'Компьютер'
        NOTEBOOK = 'notebook', 'Ноутбук'
        MONITOR = 'monitor', 'Монитор'
        PRINTER = 'printer', 'Принтер'
        OTHER = 'other', 'Прочее'

    class Status(models.TextChoices):
        IN_USE = 'in_use', 'В использовании'
        IN_STORAGE = 'in_storage', 'На складе'
        IN_REPAIR = 'in_repair', 'В ремонте'
        WRITTEN_OFF = 'written_off', 'Списано'

    name = models.CharField(max_length=300, verbose_name='Наименование')
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.OTHER, verbose_name='Категория')
    serial_number = models.CharField(max_length=200, blank=True, verbose_name='Серийный номер')
    inventory_number = models.CharField(max_length=100, unique=True, verbose_name='Инвентарный номер')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.IN_STORAGE, verbose_name='Статус')
    purchase_date = models.DateField(null=True, blank=True, verbose_name='Дата покупки')
    warranty_until = models.DateField(null=True, blank=True, verbose_name='Гарантия до')
    location = models.CharField(max_length=300, blank=True, verbose_name='Местонахождение')
    notes = models.TextField(blank=True, verbose_name='Примечания')
    assigned_to = models.ForeignKey(
        Employee, null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='equipment',
        verbose_name='Назначено'
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True,
        on_delete=models.SET_NULL,
        related_name='created_equipment',
        verbose_name='Создано пользователем'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Оборудование'
        verbose_name_plural = 'Оборудование'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.name} [{self.inventory_number}]'


class EquipmentHistory(models.Model):
    class Action(models.TextChoices):
        CREATED = 'created', 'Создано'
        UPDATED = 'updated', 'Обновлено'
        ASSIGNED = 'assigned', 'Назначено'
        UNASSIGNED = 'unassigned', 'Снято назначение'
        SYNCED_1C = 'synced_1c', 'Синхронизировано из 1С'

    equipment = models.ForeignKey(Equipment, on_delete=models.CASCADE, related_name='history')
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True,
        on_delete=models.SET_NULL
    )
    changed_at = models.DateTimeField(auto_now_add=True)
    action = models.CharField(max_length=20, choices=Action.choices)
    changes = models.JSONField(default=dict)

    class Meta:
        verbose_name = 'История изменений'
        verbose_name_plural = 'История изменений'
        ordering = ['-changed_at']

    def __str__(self):
        return f'{self.equipment} — {self.get_action_display()} ({self.changed_at:%d.%m.%Y %H:%M})'
