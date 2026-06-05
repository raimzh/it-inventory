from django.urls import path
from .views import (
    EquipmentListCreateView, EquipmentDetailView,
    EquipmentAssignView, EquipmentUnassignView, EquipmentHistoryView,
    EmployeeListCreateView, EmployeeDetailView,
    GlobalHistoryView, OneCEquipmentView,
)

urlpatterns = [
    path('equipment/', EquipmentListCreateView.as_view(), name='equipment-list'),
    path('equipment/<int:pk>/', EquipmentDetailView.as_view(), name='equipment-detail'),
    path('equipment/<int:pk>/assign/', EquipmentAssignView.as_view(), name='equipment-assign'),
    path('equipment/<int:pk>/unassign/', EquipmentUnassignView.as_view(), name='equipment-unassign'),
    path('equipment/<int:pk>/history/', EquipmentHistoryView.as_view(), name='equipment-history'),
    path('employees/', EmployeeListCreateView.as_view(), name='employee-list'),
    path('employees/<int:pk>/', EmployeeDetailView.as_view(), name='employee-detail'),
    path('history/', GlobalHistoryView.as_view(), name='global-history'),
    path('1c/equipment/', OneCEquipmentView.as_view(), name='1c-equipment'),
]
