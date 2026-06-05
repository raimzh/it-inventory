from django.conf import settings
from rest_framework import generics, filters, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Equipment, Employee, EquipmentHistory
from .serializers import (
    EquipmentSerializer, EquipmentListSerializer,
    EmployeeSerializer, EquipmentHistorySerializer,
)
from .permissions import IsAuthenticatedReadOrManagerWrite, IsManagerOrAdmin


class EquipmentListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticatedReadOrManagerWrite]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'inventory_number', 'serial_number', 'location']
    ordering_fields = ['name', 'status', 'category', 'updated_at', 'created_at']
    ordering = ['-created_at']

    def get_queryset(self):
        qs = Equipment.objects.select_related('assigned_to')
        category = self.request.query_params.get('category')
        status_param = self.request.query_params.get('status')
        if category:
            qs = qs.filter(category=category)
        if status_param:
            qs = qs.filter(status=status_param)
        return qs

    def get_serializer_class(self):
        if self.request.method == 'GET':
            return EquipmentListSerializer
        return EquipmentSerializer


class EquipmentDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Equipment.objects.select_related('assigned_to', 'created_by')
    serializer_class = EquipmentSerializer
    permission_classes = [IsAuthenticatedReadOrManagerWrite]


class EquipmentAssignView(APIView):
    permission_classes = [IsManagerOrAdmin]

    def post(self, request, pk):
        equipment = generics.get_object_or_404(Equipment, pk=pk)
        employee_id = request.data.get('employee_id')
        if not employee_id:
            return Response({'detail': 'employee_id обязателен'}, status=status.HTTP_400_BAD_REQUEST)
        employee = generics.get_object_or_404(Employee, pk=employee_id)
        equipment._changed_by = request.user
        equipment.assigned_to = employee
        equipment.save()
        return Response(EquipmentSerializer(equipment, context={'request': request}).data)


class EquipmentUnassignView(APIView):
    permission_classes = [IsManagerOrAdmin]

    def post(self, request, pk):
        equipment = generics.get_object_or_404(Equipment, pk=pk)
        equipment._changed_by = request.user
        equipment.assigned_to = None
        equipment.save()
        return Response(EquipmentSerializer(equipment, context={'request': request}).data)


class EquipmentHistoryView(generics.ListAPIView):
    serializer_class = EquipmentHistorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return EquipmentHistory.objects.filter(
            equipment_id=self.kwargs['pk']
        ).select_related('changed_by')


class GlobalHistoryView(generics.ListAPIView):
    serializer_class = EquipmentHistorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return EquipmentHistory.objects.select_related('changed_by', 'equipment').all()


class EmployeeListCreateView(generics.ListCreateAPIView):
    queryset = Employee.objects.all()
    serializer_class = EmployeeSerializer
    permission_classes = [IsAuthenticatedReadOrManagerWrite]
    filter_backends = [filters.SearchFilter]
    search_fields = ['full_name', 'department', 'email']


class EmployeeDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Employee.objects.all()
    serializer_class = EmployeeSerializer
    permission_classes = [IsAuthenticatedReadOrManagerWrite]


# --- 1С интеграция ---

class OneCApiKeyPermission(IsAuthenticated.__class__):
    def has_permission(self, request, view):
        key = request.headers.get('X-API-Key') or request.META.get('HTTP_X_API_KEY')
        return key == settings.API_1C_KEY


class OneCEquipmentView(APIView):
    permission_classes = [OneCApiKeyPermission]

    def get(self, request):
        equipment = Equipment.objects.select_related('assigned_to').all()
        data = EquipmentListSerializer(equipment, many=True).data
        return Response(data)

    def post(self, request):
        items = request.data if isinstance(request.data, list) else [request.data]
        created, updated = 0, 0
        errors = []

        for item in items:
            inv_num = item.get('inventory_number')
            if not inv_num:
                errors.append({'item': item, 'error': 'inventory_number обязателен'})
                continue

            equipment, is_new = Equipment.objects.get_or_create(
                inventory_number=inv_num,
                defaults={'name': item.get('name', inv_num)}
            )

            fields_map = {
                'name': 'name', 'category': 'category', 'serial_number': 'serial_number',
                'status': 'status', 'location': 'location', 'notes': 'notes',
            }
            for src, dst in fields_map.items():
                if src in item:
                    setattr(equipment, dst, item[src])

            equipment.save()

            action = EquipmentHistory.Action.CREATED if is_new else EquipmentHistory.Action.SYNCED_1C
            EquipmentHistory.objects.create(equipment=equipment, action=action, changes=item)

            if is_new:
                created += 1
            else:
                updated += 1

        return Response({'created': created, 'updated': updated, 'errors': errors},
                        status=status.HTTP_200_OK)
