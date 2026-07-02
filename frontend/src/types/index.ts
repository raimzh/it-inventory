export type UserRole = "admin" | "accountant" | "inventorizer" | "viewer";

export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  department?: string;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

export type AssetStatus = "active" | "not_found" | "transferred" | "repair" | "decommissioned";

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  active: "В наличии",
  not_found: "Не найдено",
  transferred: "Передано",
  repair: "На ремонте",
  decommissioned: "Списано",
};

export const ASSET_STATUS_COLORS: Record<AssetStatus, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  not_found: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  transferred: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  repair: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  decommissioned: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
};

// Предустановленные категории оборудования для выпадающего списка «Категория»
export const ASSET_CATEGORIES = [
  "Ноутбук",
  "ПК",
  "Монитор",
  "Принтер",
  "Проектор",
  "Камера",
  "Связь",
  "GSM",
] as const;

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: "Администратор",
  accountant: "Бухгалтер",
  inventorizer: "Инвентаризатор",
  viewer: "Просмотр",
};

export interface Asset {
  id: string;
  inventoryNumber: string;
  name: string;
  serialNumber?: string;
  departmentId?: string;
  departmentName?: string;
  location?: string;
  responsiblePerson?: string;
  ownerId?: string;
  ownerName?: string;
  commissioningDate?: string;
  residualValue: number;
  initialValue: number;
  status: AssetStatus;
  category?: string;
  manufacturer?: string;
  model?: string;
  comment?: string;
  qrCode?: string;
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
  department?: { id: string; name: string };
  owner?: User;
}

export interface AssetFile {
  id: string;
  assetId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  type: string;
  createdAt: string;
}

export interface AssetHistory {
  id: string;
  field: string;
  oldValue?: string;
  newValue?: string;
  changedByName?: string;
  source: string;
  createdAt: string;
}

export interface Department {
  id: string;
  name: string;
  code?: string;
  parentId?: string;
  createdAt?: string;
}

export interface SyncLog {
  id: string;
  status: "pending" | "running" | "success" | "error";
  startedAt: string;
  finishedAt?: string;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
  errors: any[];
  triggeredByName?: string;
  source: string;
}

export interface InventorySession {
  id: string;
  name: string;
  description?: string;
  status: "open" | "in_progress" | "closed";
  startDate: string;
  endDate?: string;
  totalAssets: number;
  checkedAssets: number;
  createdByName?: string;
  createdAt: string;
  department?: Department;
}

export interface InventoryItem {
  id: string;
  assetId: string;
  sessionId: string;
  status: AssetStatus;
  isChecked: boolean;
  checkedByName?: string;
  checkedAt?: string;
  comment?: string;
  locationFound?: string;
  asset?: Asset;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DashboardStats {
  total: number;
  byStatus: Array<{ status: string; count: string }>;
  byDepartment: Array<{ department: string; count: string }>;
  totalResidualValue: number;
}
