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

// ── Склад ───────────────────────────────────────────────────────────────────
export type MovementType = "receipt" | "issue" | "return" | "write_off" | "transfer" | "adjustment";

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  receipt: "Приём", issue: "Выдача", return: "Возврат",
  write_off: "Списание", transfer: "Перемещение", adjustment: "Корректировка",
};
export const MOVEMENT_TYPE_COLORS: Record<MovementType, string> = {
  receipt: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  issue: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  return: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  write_off: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  transfer: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200",
  adjustment: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
};

export type StockUnitStatus = "in_stock" | "issued" | "in_repair" | "written_off";
export const UNIT_STATUS_LABELS: Record<StockUnitStatus, string> = {
  in_stock: "На складе", issued: "Выдан", in_repair: "В ремонте", written_off: "Списан",
};
export type UnitCondition = "new" | "used" | "faulty";
export const UNIT_CONDITION_LABELS: Record<UnitCondition, string> = {
  new: "Новое", used: "Б/у", faulty: "Неисправно",
};

export const ITEM_UNITS = ["шт", "упак", "компл", "м"] as const;

export interface ItemCategory {
  id: string; name: string; parentId?: string; sortOrder: number; isActive: boolean;
}
export interface WarehouseRef {
  id: string; name: string; location?: string; isActive: boolean;
}
export interface WarehouseItem {
  id: string; sku: string; name: string; unit: string; isSerialized: boolean;
  minStock: number | null; manufacturer?: string; model?: string;
  categoryId?: string; categoryName?: string; balance: number; belowMin: boolean;
}
export interface StockUnit {
  id: string; itemId: string; serialNumber: string; inventoryNumber?: string;
  status: StockUnitStatus; condition: UnitCondition;
  warehouse?: WarehouseRef; currentHolder?: WarehouseEmployee;
  purchaseDate?: string; warrantyUntil?: string; purchasePrice?: number; notes?: string;
}
export interface StockMovement {
  id: string; itemId: string; type: MovementType; quantity: number;
  documentNumber?: string; reason?: string; reversalOf?: string; createdAt: string;
  item?: { id: string; name: string; unit: string };
  warehouse?: WarehouseRef; employee?: WarehouseEmployee; stockUnit?: StockUnit;
}
export interface WarehouseEmployee {
  id: string; fullName: string; position?: string; personnelNumber?: string;
  email?: string; phone?: string; departmentId?: string; department?: Department; isActive: boolean;
}
export interface ItemCard {
  item: WarehouseItem & { category?: ItemCategory };
  balances: Array<{ warehouseId: string; warehouseName: string; balance: number; belowMin: boolean }>;
  movements: StockMovement[];
  compatibility: Array<{ id: string; sku: string; name: string; isSerialized: boolean; balance: number }>;
  units: StockUnit[];
}
export interface InventoryCheck {
  id: string; warehouseId: string; warehouse?: WarehouseRef;
  startedAt: string; finishedAt?: string; status: "in_progress" | "completed" | "cancelled";
}
