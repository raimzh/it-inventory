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

// Access-токен живёт 30 минут. Чтобы пользователя не выбрасывало на форму входа
// посреди работы, первый же 401 пробуем починить обменом refresh-токена и
// повторяем исходный запрос. Параллельные 401 ждут одного общего обновления,
// иначе каждый запрос затеет свой обмен и ротация токенов перебьёт сама себя.
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = Cookies.get("refresh_token");
  if (!refreshToken) throw new Error("no refresh token");
  const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
  Cookies.set("access_token", data.accessToken, { expires: 1, sameSite: "strict" });
  Cookies.set("refresh_token", data.refreshToken, { expires: 7, sameSite: "strict" });
  return data.accessToken;
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original: any = err.config || {};
    const url: string = original.url || "";
    const isAuthCall = url.includes("/auth/login") || url.includes("/auth/refresh");

    if (err.response?.status === 401 && !isAuthCall && !original._retried) {
      original._retried = true;
      try {
        refreshPromise = refreshPromise || refreshAccessToken().finally(() => { refreshPromise = null; });
        const token = await refreshPromise;
        original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
        return api(original);
      } catch {
        // Обновиться не вышло — сессия действительно закончилась
        Cookies.remove("access_token");
        Cookies.remove("refresh_token");
        if (typeof window !== "undefined") window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

// Auth
export const authApi = {
  login: (username: string, password: string) =>
    api.post("/auth/login", { username, password }),
  getProfile: () => api.get("/auth/profile"),
  refresh: (refreshToken: string) => api.post("/auth/refresh", { refreshToken }),
  logout: () => api.post("/auth/logout"),
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
// IMPORTANT: The `api` instance sets a default Content-Type of application/json.
// For FormData requests that default must be cleared (set to undefined), otherwise
// axios JSON-encodes the FormData instead of sending it as multipart and the
// browser never adds the multipart boundary.
export const excelApi = {
  downloadTemplate: () =>
    api.get('/assets/excel/template', { responseType: 'blob' }),
  preview: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/assets/excel/preview', fd, {
      headers: { 'Content-Type': undefined },
    });
  },
  importFile: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/assets/excel/import', fd, {
      headers: { 'Content-Type': undefined },
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

// Warehouse (Склад)
export const warehouseApi = {
  // номенклатура
  listItems: (params?: any) => api.get("/warehouse/items", { params }),
  getItem: (id: string) => api.get(`/warehouse/items/${id}`),
  availableUnits: (id: string) => api.get(`/warehouse/items/${id}/available-units`),
  createItem: (data: any) => api.post("/warehouse/items", data),
  updateItem: (id: string, data: any) => api.patch(`/warehouse/items/${id}`, data),
  deleteItem: (id: string) => api.delete(`/warehouse/items/${id}`),
  setCompatibility: (id: string, compatibleItemIds: string[]) =>
    api.put(`/warehouse/items/${id}/compatibility`, { compatibleItemIds }),
  // операции
  receipt: (data: any) => api.post("/warehouse/stock/receipt", data),
  issue: (data: any) => api.post("/warehouse/stock/issue", data),
  returnItems: (data: any) => api.post("/warehouse/stock/return", data),
  writeOff: (data: any) => api.post("/warehouse/stock/write-off", data),
  reverse: (id: string, reason?: string) => api.post(`/warehouse/movements/${id}/reverse`, { reason }),
  journal: (params?: any) => api.get("/warehouse/movements", { params }),
  // справочники
  categories: () => api.get("/warehouse/categories"),
  createCategory: (data: any) => api.post("/warehouse/categories", data),
  warehouses: () => api.get("/warehouse/warehouses"),
  createWarehouse: (data: any) => api.post("/warehouse/warehouses", data),
  // сотрудники
  listEmployees: (search?: string) => api.get("/warehouse/employees", { params: { search } }),
  getEmployee: (id: string) => api.get(`/warehouse/employees/${id}`),
  employeeHoldings: (id: string, params?: any) => api.get(`/warehouse/employees/${id}/holdings`, { params }),
  createEmployee: (data: any) => api.post("/warehouse/employees", data),
  // инвентаризация
  listChecks: () => api.get("/warehouse/checks"),
  getCheck: (id: string) => api.get(`/warehouse/checks/${id}`),
  createCheck: (warehouseId: string) => api.post("/warehouse/checks", { warehouseId }),
  submitCheck: (id: string, items: any[]) => api.post(`/warehouse/checks/${id}/submit`, { items }),
  completeCheck: (id: string) => api.post(`/warehouse/checks/${id}/complete`),
  // отчёты
  reportToPurchase: () => api.get("/warehouse/reports/to-purchase"),
  reportConsumption: (dateFrom?: string, dateTo?: string) =>
    api.get("/warehouse/reports/consumption", { params: { dateFrom, dateTo } }),
  reportHoldings: () => api.get("/warehouse/reports/holdings"),
  exportJournal: (params?: any) =>
    api.get("/warehouse/reports/export/journal", { params, responseType: "blob" }),
  exportInventory: (checkId: string) =>
    api.get(`/warehouse/reports/export/inventory/${checkId}`, { responseType: "blob" }),
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
