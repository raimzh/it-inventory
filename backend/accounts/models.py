from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = 'admin', 'Администратор'
        MANAGER = 'manager', 'Менеджер'
        VIEWER = 'viewer', 'Наблюдатель'

    role = models.CharField(max_length=10, choices=Role.choices, default=Role.VIEWER)

    def __str__(self):
        return f'{self.get_full_name() or self.username} ({self.get_role_display()})'
