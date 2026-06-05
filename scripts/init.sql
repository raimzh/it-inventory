-- IT Inventory Database Initialization
-- This runs on first start of PostgreSQL container

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enum types
CREATE TYPE user_role AS ENUM ('admin', 'accountant', 'inventorizer', 'viewer');
CREATE TYPE asset_status AS ENUM ('active', 'not_found', 'transferred', 'repair', 'decommissioned');
CREATE TYPE sync_status AS ENUM ('pending', 'running', 'success', 'error');
CREATE TYPE inventory_session_status AS ENUM ('open', 'in_progress', 'closed');

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'viewer',
  department VARCHAR(255),
  telegram_chat_id VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  email_notifications BOOLEAN NOT NULL DEFAULT true,
  telegram_notifications BOOLEAN NOT NULL DEFAULT false,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Departments
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) UNIQUE NOT NULL,
  code VARCHAR(50) UNIQUE,
  parent_id UUID REFERENCES departments(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Assets (Основные Средства)
CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  inventory_number VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(500) NOT NULL,
  serial_number VARCHAR(255),
  department_id UUID REFERENCES departments(id),
  department_name VARCHAR(255),
  location VARCHAR(500),
  responsible_person VARCHAR(255),
  owner_id UUID REFERENCES users(id),
  owner_name VARCHAR(255),
  commissioning_date DATE,
  decommission_date DATE,
  residual_value NUMERIC(15, 2) DEFAULT 0,
  initial_value NUMERIC(15, 2) DEFAULT 0,
  status asset_status NOT NULL DEFAULT 'active',
  category VARCHAR(255),
  manufacturer VARCHAR(255),
  model VARCHAR(255),
  comment TEXT,
  one_c_id VARCHAR(255),
  one_c_guid VARCHAR(255),
  last_synced_at TIMESTAMPTZ,
  qr_code VARCHAR(255),
  barcode VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Asset photos / documents
CREATE TABLE IF NOT EXISTS asset_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100),
  size INTEGER,
  type VARCHAR(50) NOT NULL DEFAULT 'photo',
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Asset change history
CREATE TABLE IF NOT EXISTS asset_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  field VARCHAR(100) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by UUID REFERENCES users(id),
  changed_by_name VARCHAR(255),
  source VARCHAR(50) DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1C Sync logs
CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status sync_status NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  records_processed INTEGER DEFAULT 0,
  records_created INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_skipped INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]',
  triggered_by UUID REFERENCES users(id),
  triggered_by_name VARCHAR(255),
  source VARCHAR(50) DEFAULT 'scheduler'
);

-- Inventory sessions
CREATE TABLE IF NOT EXISTS inventory_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status inventory_session_status NOT NULL DEFAULT 'open',
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date TIMESTAMPTZ,
  department_id UUID REFERENCES departments(id),
  created_by UUID REFERENCES users(id),
  created_by_name VARCHAR(255),
  closed_by UUID REFERENCES users(id),
  total_assets INTEGER DEFAULT 0,
  checked_assets INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inventory items (results per asset)
CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES inventory_sessions(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES assets(id),
  status asset_status NOT NULL DEFAULT 'active',
  is_checked BOOLEAN NOT NULL DEFAULT false,
  checked_by UUID REFERENCES users(id),
  checked_by_name VARCHAR(255),
  checked_at TIMESTAMPTZ,
  comment TEXT,
  location_found VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, asset_id)
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  username VARCHAR(100),
  action VARCHAR(100) NOT NULL,
  resource VARCHAR(100),
  resource_id VARCHAR(255),
  details JSONB,
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backup records
CREATE TABLE IF NOT EXISTS backup_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename VARCHAR(255) NOT NULL,
  path VARCHAR(500) NOT NULL,
  size BIGINT,
  type VARCHAR(50) NOT NULL DEFAULT 'auto',
  status VARCHAR(50) NOT NULL DEFAULT 'completed',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_assets_inventory_number ON assets(inventory_number);
CREATE INDEX idx_assets_status ON assets(status);
CREATE INDEX idx_assets_department ON assets(department_id);
CREATE INDEX idx_assets_owner ON assets(owner_id);
CREATE INDEX idx_assets_one_c_guid ON assets(one_c_guid);
CREATE INDEX idx_asset_history_asset_id ON asset_history(asset_id);
CREATE INDEX idx_inventory_items_session ON inventory_items(session_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX idx_sync_logs_status ON sync_logs(status);

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER assets_updated_at BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER inventory_sessions_updated_at BEFORE UPDATE ON inventory_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed: default admin user (password: Admin@123)
INSERT INTO users (username, email, password_hash, full_name, role, is_active)
VALUES (
  'admin',
  'admin@inventory.local',
  crypt('Admin@123', gen_salt('bf', 12)),
  'Администратор',
  'admin',
  true
) ON CONFLICT (username) DO NOTHING;

-- Seed: example departments
INSERT INTO departments (name, code) VALUES
  ('ИТ-отдел', 'IT'),
  ('Бухгалтерия', 'ACCT'),
  ('Склад', 'WH'),
  ('Администрация', 'ADMIN'),
  ('Производство', 'PROD')
ON CONFLICT (name) DO NOTHING;
