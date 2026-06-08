import axios from "axios";
import Cookies from "js-cookie";

// In Docker: requests go through nginx /api/ → backend (no CORS issues)
// In dev: next.config.mjs rewrites /api/* → localhost:3001/*
const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = Cookies.get("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      Cookies.remove("access_token");
      if (typeof window !== "undefined") window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

// Auth
export const authApi = {
  login: (username: string, password: string) =>
    api.post("/auth/login", { username, password }),
  getProfile: () => api.get("/auth/profile"),
};

// Assets
export const assetsApi = {
  getAll: (params?: Record<string, any>) =>
    api.get("/assets", { params }),
  getOne: (id: string) => api.get(`/assets/${id}`),
  getHistory: (id: string) => api.get(`/assets/${id}/history`),
  getFiles: (id: string) => api.get(`/assets/${id}/files`),
  getQrCode: (id: string) => api.get(`/assets/${id}/qrcode`),
  getStats: () => api.get("/assets/stats"),
  create: (data: any) => api.post("/assets", data),
  update: (id: string, data: any) => api.patch(`/assets/${id}`, data),
  bulkUpdate: (ids: string[], update: any) =>
    api.post("/assets/bulk-update", { ids, update }),
  delete: (id: string) => api.delete(`/assets/${id}`),
  uploadFile: (id: string, formData: FormData, type: string) =>
    api.post(`/assets/${id}/files?type=${type}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  deleteFile: (assetId: string, fileId: string) =>
    api.delete(`/assets/${assetId}/files/${fileId}`),
};

// Departments
export const departmentsApi = {
  getAll: () => api.get("/departments"),
  create: (data: any) => api.post("/departments", data),
  update: (id: string, data: any) => api.patch(`/departments/${id}`, data),
  delete: (id: string) => api.delete(`/departments/${id}`),
};

// Inventory
export const inventoryApi = {
  getSessions: (params?: any) => api.get("/inventory/sessions", { params }),
  getSession: (id: string) => api.get(`/inventory/sessions/${id}`),
  getSessionStats: (id: string) => api.get(`/inventory/sessions/${id}/stats`),
  getSessionItems: (id: string, params?: any) =>
    api.get(`/inventory/sessions/${id}/items`, { params }),
  createSession: (data: any) => api.post("/inventory/sessions", data),
  checkItem: (sessionId: string, assetId: string, data: any) =>
    api.patch(`/inventory/sessions/${sessionId}/items/${assetId}`, data),
  scanByInventoryNumber: (sessionId: string, data: any) =>
    api.post(`/inventory/sessions/${sessionId}/scan`, data),
  closeSession: (id: string) => api.post(`/inventory/sessions/${id}/close`),
};

// Sync
export const syncApi = {
  run: () => api.post("/sync/run"),
  getLogs: (limit?: number) => api.get("/sync/logs", { params: { limit } }),
  getLastSync: () => api.get("/sync/last"),
  importFile: (data: any[]) => api.post("/sync/import", { data }),
};

// Reports
export const reportsApi = {
  getMissing: (departmentId?: string) =>
    api.get("/reports/missing", { params: { departmentId } }),
  getDepartmentReport: () => api.get("/reports/by-department"),
  getOwnerHistory: (assetId?: string) =>
    api.get("/reports/owner-history", { params: { assetId } }),
  exportAssets: () =>
    api.get("/reports/export/assets", { responseType: "blob" }),
  exportInventory: (sessionId: string) =>
    api.get(`/reports/export/inventory/${sessionId}`, { responseType: "blob" }),
};

// Users
export const usersApi = {
  getAll: (params?: any) => api.get("/users", { params }),
  getOne: (id: string) => api.get(`/users/${id}`),
  getStats: () => api.get("/users/stats"),
  create: (data: any) => api.post("/users", data),
  update: (id: string, data: any) => api.patch(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
};

// Excel Import
export const excelApi = {
  downloadTemplate: () => `${API_URL}/assets/excel/template`,
  preview: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/assets/excel/preview', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  importFile: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/assets/excel/import', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getLogs: (limit = 20) => api.get(`/assets/excel/logs?limit=${limit}`),
};

// Backup
export const backupApi = {
  list: () => api.get("/backup"),
  create: () => api.post("/backup"),
  download: (filename: string) =>
    `${API_URL}/backup/download/${filename}`,
};

// Audit
export const auditApi = {
  getLogs: (params?: any) => api.get("/audit", { params }),
};

// Helper: trigger Excel download
export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
