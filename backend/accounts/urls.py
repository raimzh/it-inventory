from django.urls import path
from .views import UserListCreateView, UserDetailView, MeView

urlpatterns = [
    path('users/', UserListCreateView.as_view(), name='user-list'),
    path('users/me/', MeView.as_view(), name='user-me'),
    path('users/<int:pk>/', UserDetailView.as_view(), name='user-detail'),
]
