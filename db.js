const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'pos.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// ==================== SCHEMA (v2 — multi-tenant) ====================
// Every business table carries a tenantId. Uniqueness that used to be global
// (username, invoiceNumber) is now per tenant, so two clients can safely reuse
// the same username or start their invoice numbering at 1.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS schema_info (
    version INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL COLLATE NOCASE UNIQUE,
    name TEXT NOT NULL,
    ownerName TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    plan TEXT NOT NULL DEFAULT 'basic',
    status TEXT NOT NULL DEFAULT 'active',
    createdAt TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    tenantId TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    username TEXT NOT NULL COLLATE NOCASE,
    password TEXT NOT NULL,
    displayName TEXT DEFAULT '',
    role TEXT DEFAULT 'cashier',
    active INTEGER DEFAULT 1,
    createdAt TEXT,
    UNIQUE (tenantId, username)
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    tenantId TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price REAL DEFAULT 0,
    description TEXT DEFAULT '',
    sku TEXT DEFAULT '',
    barcode TEXT DEFAULT '',
    imageUrl TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    createdAt TEXT
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    tenantId TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    invoiceNumber INTEGER NOT NULL,
    subtotal REAL DEFAULT 0,
    discount REAL DEFAULT 0,
    taxRate REAL DEFAULT 0,
    taxAmount REAL DEFAULT 0,
    total REAL DEFAULT 0,
    paymentMethod TEXT DEFAULT '',
    cashierName TEXT DEFAULT '',
    customerName TEXT DEFAULT '',
    customerPhone TEXT DEFAULT '',
    guestsCount REAL DEFAULT 0,
    reservedAt TEXT DEFAULT '',
    createdAt TEXT,
    UNIQUE (tenantId, invoiceNumber)
  );

  CREATE TABLE IF NOT EXISTS invoice_items (
    rowid INTEGER PRIMARY KEY AUTOINCREMENT,
    tenantId TEXT NOT NULL,
    invoiceId TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    productId TEXT DEFAULT '',
    productName TEXT DEFAULT '',
    quantity REAL DEFAULT 0,
    unitPrice REAL DEFAULT 0,
    total REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    tenantId TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title TEXT DEFAULT '',
    amount REAL DEFAULT 0,
    branchId TEXT DEFAULT '',
    branchName TEXT DEFAULT '',
    description TEXT DEFAULT '',
    createdAt TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    tenantId TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    shopName TEXT DEFAULT '',
    address TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    taxId TEXT DEFAULT '',
    taxRate REAL DEFAULT 15,
    receiptWidth TEXT DEFAULT '80mm',
    logoUrl TEXT DEFAULT '',
    branches TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS meta (
    tenantId TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT,
    PRIMARY KEY (tenantId, key)
  );
`;

db.exec(SCHEMA);

const INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_users_tenant ON users (tenantId);
  CREATE INDEX IF NOT EXISTS idx_products_tenant ON products (tenantId);
  CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices (tenantId, invoiceNumber DESC);
  CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items (tenantId, invoiceId);
  CREATE INDEX IF NOT EXISTS idx_expenses_tenant ON expenses (tenantId);
  CREATE INDEX IF NOT EXISTS idx_meta_tenant ON meta (tenantId);
`;

// ==================== HELPERS ====================
const now = () => new Date().toISOString();
const bool = (v) => (v ? 1 : 0);
const unbool = (row) => {
  if (row && 'active' in row) row.active = !!row.active;
  return row;
};
const generateId = (prefix) =>
  `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;

function tableExists(name) {
  return !!db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
}

function columnsOf(table) {
  if (!tableExists(table)) return [];
  return db.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name);
}

const hasColumn = (table, column) => columnsOf(table).includes(column);

function readJsonFile(filename) {
  const fp = path.join(DATA_DIR, filename);
  try {
    if (fs.existsSync(fp)) return JSON.parse(fs.readFileSync(fp, 'utf-8'));
  } catch (e) {
    console.error(`Migration: error reading ${filename}:`, e.message);
  }
  return null;
}

// ==================== LEGACY -> MULTI-TENANT MIGRATION ====================
function ensureLegacyInvoiceColumns() {
  // The very oldest databases predate the customer/reservation columns.
  if (!tableExists('invoices') || hasColumn('invoices', 'tenantId')) return;
  const add = (name, def) => {
    if (!hasColumn('invoices', name)) {
      db.exec(`ALTER TABLE invoices ADD COLUMN ${name} ${def}`);
    }
  };
  add('customerName', "TEXT DEFAULT ''");
  add('customerPhone', "TEXT DEFAULT ''");
  add('guestsCount', 'REAL DEFAULT 0');
  add('reservedAt', "TEXT DEFAULT ''");
}

function backupLegacyDatabase() {
  const backupPath = path.join(DATA_DIR, 'pos.db.pre-saas-backup');
  if (fs.existsSync(backupPath)) return;
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    fs.copyFileSync(DB_PATH, backupPath);
    console.log(`🗄️  Single-tenant backup saved to ${backupPath}`);
  } catch (e) {
    console.warn('⚠️  Could not back up the database before migration:', e.message);
  }
}

/**
 * Moves a pre-SaaS database (global tables, no tenantId) into the multi-tenant
 * schema: every existing row is attached to one tenant named after the shop, so
 * the current client keeps working while new tenants start empty.
 */
function migrateLegacyToMultiTenant() {
  if (!tableExists('users') || hasColumn('users', 'tenantId')) return null;

  backupLegacyDatabase();

  let shopName = 'المتجر الرئيسي';
  if (tableExists('settings')) {
    try {
      const row = db.prepare('SELECT shopName FROM settings WHERE id = 1').get();
      if (row && row.shopName) shopName = row.shopName;
    } catch {
      /* settings had an unexpected shape — keep the default name */
    }
  }

  const tenantId = generateId('tn');
  const legacyTables = ['users', 'products', 'invoices', 'invoice_items', 'expenses', 'settings', 'meta'];
  const toRebuild = legacyTables.filter((t) => tableExists(t) && !hasColumn(t, 'tenantId'));

  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN');
  try {
    // 1. Rename legacy tables, then let SCHEMA recreate them with tenant columns.
    for (const table of toRebuild) {
      db.exec(`ALTER TABLE ${table} RENAME TO ${table}_legacy`);
    }
    db.exec(SCHEMA);

    // 2. Create the tenant that owns all pre-existing data.
    db.prepare(
      `INSERT INTO tenants (id, slug, name, ownerName, phone, plan, status, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(tenantId, 'main', shopName, '', '', 'basic', 'active', now());

    const had = (t) => toRebuild.includes(t);

    if (had('users')) {
      db.prepare(
        `INSERT INTO users (id, tenantId, username, password, displayName, role, active, createdAt)
         SELECT id, ?, username, password, displayName, role, active, createdAt FROM users_legacy`
      ).run(tenantId);
    }

    if (had('products')) {
      db.prepare(
        `INSERT INTO products (id, tenantId, name, price, description, sku, barcode, imageUrl, active, createdAt)
         SELECT id, ?, name, price, description, sku, barcode, imageUrl, active, createdAt FROM products_legacy`
      ).run(tenantId);
    }

    if (had('invoices')) {
      db.prepare(
        `INSERT INTO invoices (id, tenantId, invoiceNumber, subtotal, discount, taxRate, taxAmount, total,
                               paymentMethod, cashierName, customerName, customerPhone, guestsCount, reservedAt, createdAt)
         SELECT id, ?, invoiceNumber, subtotal, discount, taxRate, taxAmount, total,
                paymentMethod, cashierName, customerName, customerPhone, guestsCount, reservedAt, createdAt
           FROM invoices_legacy`
      ).run(tenantId);
    }

    if (had('invoice_items')) {
      db.prepare(
        `INSERT INTO invoice_items (tenantId, invoiceId, productId, productName, quantity, unitPrice, total)
         SELECT ?, invoiceId, productId, productName, quantity, unitPrice, total FROM invoice_items_legacy`
      ).run(tenantId);
    }

    if (had('expenses')) {
      db.prepare(
        `INSERT INTO expenses (id, tenantId, title, amount, branchId, branchName, description, createdAt)
         SELECT id, ?, title, amount, branchId, branchName, description, createdAt FROM expenses_legacy`
      ).run(tenantId);
    }

    if (had('settings')) {
      db.prepare(
        `INSERT INTO settings (tenantId, shopName, address, phone, taxId, taxRate, receiptWidth, logoUrl, branches)
         SELECT ?, shopName, address, phone, taxId, taxRate, receiptWidth, logoUrl, branches
           FROM settings_legacy WHERE id = 1`
      ).run(tenantId);
    }

    if (had('meta')) {
      db.prepare(
        `INSERT INTO meta (tenantId, key, value) SELECT ?, key, value FROM meta_legacy`
      ).run(tenantId);
    }

    // 3. Give this tenant its own invoice counter, continuing from its data.
    const maxRow = db
      .prepare('SELECT MAX(invoiceNumber) AS m FROM invoices WHERE tenantId = ?')
      .get(tenantId);
    const legacyCounter = db
      .prepare("SELECT value FROM meta WHERE tenantId = ? AND key = 'invoice_next'")
      .get(tenantId);
    const next = Math.max(
      Number(maxRow && maxRow.m ? maxRow.m : 0) + 1,
      Number(legacyCounter && legacyCounter.value ? legacyCounter.value : 1)
    );
    db.prepare(
      "INSERT OR REPLACE INTO meta (tenantId, key, value) VALUES (?, 'invoice_next', ?)"
    ).run(tenantId, String(next));

    // 4. Drop the legacy copies.
    for (const table of toRebuild) {
      db.exec(`DROP TABLE ${table}_legacy`);
    }

    db.exec('COMMIT');
    console.log(`🏢 Migrated existing data into tenant "main" (${shopName})`);
  } catch (e) {
    db.exec('ROLLBACK');
    console.error('❌ Multi-tenant migration failed:', e.message);
    throw e;
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }

  return tenantId;
}

function ensureDefaultTenant() {
  const existing = db.prepare('SELECT id FROM tenants ORDER BY createdAt LIMIT 1').get();
  if (existing) return existing.id;

  const settingsJson = readJsonFile('settings.json');
  const name =
    settingsJson && settingsJson.shopName ? settingsJson.shopName : 'المتجر الرئيسي';
  const id = generateId('tn');
  db.prepare(
    `INSERT INTO tenants (id, slug, name, ownerName, phone, plan, status, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, 'main', name, '', '', 'basic', 'active', now());
  db.prepare(
    `INSERT INTO meta (tenantId, key, value) VALUES (?, 'invoice_next', '1')`
  ).run(id);
  return id;
}

function ensureSettingsRow(tenantId) {
  const existing = db.prepare('SELECT tenantId FROM settings WHERE tenantId = ?').get(tenantId);
  if (existing) return;
  const tenant = db.prepare('SELECT name FROM tenants WHERE id = ?').get(tenantId);
  db.prepare(
    `INSERT INTO settings (tenantId, shopName, address, phone, taxId, taxRate, receiptWidth, logoUrl, branches)
     VALUES (?, ?, '', '', '', 15, '80mm', '', '[]')`
  ).run(tenantId, tenant && tenant.name ? tenant.name : '');
}

// ==================== ONE-TIME IMPORT FROM JSON FILES ====================
function migrateFromJson(tenantId) {
  if (!tenantId) return;
  const countFor = (table) =>
    db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE tenantId = ?`).get(tenantId).c;

  if (countFor('users') === 0) {
    const users = readJsonFile('users.json');
    if (Array.isArray(users) && users.length) {
      const stmt = db.prepare(
        `INSERT OR IGNORE INTO users (id, tenantId, username, password, displayName, role, active, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const u of users) {
        stmt.run(
          String(u.id),
          tenantId,
          u.username,
          u.password,
          u.displayName || '',
          u.role || 'cashier',
          bool(u.active !== false),
          u.createdAt || now()
        );
      }
      console.log(`📦 Migrated ${users.length} users from users.json`);
    }
  }

  if (countFor('products') === 0) {
    const products = readJsonFile('products.json');
    if (Array.isArray(products) && products.length) {
      const stmt = db.prepare(
        `INSERT OR IGNORE INTO products (id, tenantId, name, price, description, sku, barcode, imageUrl, active, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const p of products) {
        stmt.run(
          String(p.id),
          tenantId,
          p.name || '',
          Number(p.price) || 0,
          p.description || '',
          p.sku || '',
          p.barcode || '',
          p.imageUrl || '',
          bool(p.active !== false),
          p.createdAt || now()
        );
      }
      console.log(`📦 Migrated ${products.length} products from products.json`);
    }
  }

  if (countFor('invoices') === 0) {
    const invoices = readJsonFile('invoices.json');
    if (Array.isArray(invoices) && invoices.length) {
      const invStmt = db.prepare(
        `INSERT OR IGNORE INTO invoices (id, tenantId, invoiceNumber, subtotal, discount, taxRate, taxAmount, total,
                                         paymentMethod, cashierName, customerName, customerPhone, guestsCount, reservedAt, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      const itemStmt = db.prepare(
        `INSERT INTO invoice_items (tenantId, invoiceId, productId, productName, quantity, unitPrice, total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      let maxNumber = 0;
      for (const inv of invoices) {
        invStmt.run(
          String(inv.id),
          tenantId,
          Number(inv.invoiceNumber) || 0,
          Number(inv.subtotal) || 0,
          Number(inv.discount) || 0,
          Number(inv.taxRate) || 0,
          Number(inv.taxAmount) || 0,
          Number(inv.total) || 0,
          inv.paymentMethod || '',
          inv.cashierName || '',
          inv.customerName || '',
          inv.customerPhone || '',
          Number(inv.guestsCount) || 0,
          inv.reservedAt || '',
          inv.createdAt || now()
        );
        if (Number(inv.invoiceNumber) > maxNumber) maxNumber = Number(inv.invoiceNumber);
        for (const it of inv.items || []) {
          itemStmt.run(
            tenantId,
            String(inv.id),
            it.productId ? String(it.productId) : '',
            it.productName || '',
            Number(it.quantity) || 0,
            Number(it.unitPrice) || 0,
            Number(it.total) || 0
          );
        }
      }
      const counterFile = readJsonFile('invoice_counter.json');
      const next = Math.max(
        maxNumber + 1,
        counterFile && Number(counterFile.next) ? Number(counterFile.next) : 1
      );
      db.prepare(
        "INSERT OR REPLACE INTO meta (tenantId, key, value) VALUES (?, 'invoice_next', ?)"
      ).run(tenantId, String(next));
      console.log(`📦 Migrated ${invoices.length} invoices from invoices.json (next number: ${next})`);
    }
  }

  if (countFor('expenses') === 0) {
    const expenses = readJsonFile('expenses.json');
    if (Array.isArray(expenses) && expenses.length) {
      const stmt = db.prepare(
        `INSERT OR IGNORE INTO expenses (id, tenantId, title, amount, branchId, branchName, description, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const e of expenses) {
        stmt.run(
          String(e.id),
          tenantId,
          e.title || '',
          Number(e.amount) || 0,
          e.branchId || '',
          e.branchName || '',
          e.description || '',
          e.createdAt || now()
        );
      }
      console.log(`📦 Migrated ${expenses.length} expenses from expenses.json`);
    }
  }

  const hasSettings = db.prepare('SELECT tenantId FROM settings WHERE tenantId = ?').get(tenantId);
  if (!hasSettings) {
    const s = readJsonFile('settings.json');
    if (s && typeof s === 'object') {
      db.prepare(
        `INSERT INTO settings (tenantId, shopName, address, phone, taxId, taxRate, receiptWidth, logoUrl, branches)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        tenantId,
        s.shopName || '',
        s.address || '',
        s.phone || '',
        s.taxId || '',
        Number(s.taxRate) || 0,
        s.receiptWidth || '80mm',
        s.logoUrl || '',
        JSON.stringify(s.branches || [])
      );
      console.log('📦 Migrated settings from settings.json');
    }
  }
}

function recordSchemaVersion() {
  const row = db.prepare('SELECT version FROM schema_info ORDER BY version DESC LIMIT 1').get();
  if (!row) db.prepare('INSERT INTO schema_info (version) VALUES (?)').run(2);
}

ensureLegacyInvoiceColumns();
const migratedTenantId = migrateLegacyToMultiTenant();
const defaultTenantId = migratedTenantId || ensureDefaultTenant();
migrateFromJson(defaultTenantId);
ensureSettingsRow(defaultTenantId);
recordSchemaVersion();
db.exec(INDEXES);

// ==================== ROW MAPPERS ====================
function getInvoiceItems(tenantId, invoiceId) {
  return db
    .prepare(
      `SELECT productId, productName, quantity, unitPrice, total
         FROM invoice_items WHERE tenantId = ? AND invoiceId = ? ORDER BY rowid`
    )
    .all(tenantId, invoiceId)
    .map((r) => ({ ...r }));
}

function withItems(invoice) {
  if (!invoice) return invoice;
  return { ...invoice, items: getInvoiceItems(invoice.tenantId, invoice.id) };
}

/** Builds a safe UPDATE for a whitelist of columns. */
function applyUpdate(table, fields, allowed, where, whereParams) {
  const keys = Object.keys(fields || {}).filter((k) => allowed.includes(k));
  if (!keys.length) return 0;
  const set = keys.map((k) => `"${k}" = ?`).join(', ');
  return db
    .prepare(`UPDATE ${table} SET ${set} WHERE ${where}`)
    .run(...keys.map((k) => fields[k]), ...whereParams).changes;
}

const USER_FIELDS = ['username', 'password', 'displayName', 'role', 'active'];
const PRODUCT_FIELDS = ['name', 'price', 'description', 'sku', 'barcode', 'imageUrl', 'active'];
const SETTINGS_FIELDS = [
  'shopName',
  'address',
  'phone',
  'taxId',
  'taxRate',
  'receiptWidth',
  'logoUrl',
  'branches'
];
const TENANT_FIELDS = ['name', 'ownerName', 'phone', 'plan', 'status'];

// ==================== QUERY API (every call is tenant-scoped) ====================
const queries = {
  // ---- tenants ----
  allTenants: () => db.prepare('SELECT * FROM tenants ORDER BY createdAt').all().map((r) => ({ ...r })),
  findTenantById: (id) => {
    const r = db.prepare('SELECT * FROM tenants WHERE id = ?').get(String(id || ''));
    return r ? { ...r } : undefined;
  },
  findTenantBySlug: (slug) => {
    const r = db
      .prepare('SELECT * FROM tenants WHERE slug = ? COLLATE NOCASE')
      .get(String(slug || '').trim());
    return r ? { ...r } : undefined;
  },
  createTenant: ({ name, slug, ownerName = '', phone = '', plan = 'basic' }) => {
    const id = generateId('tn');
    db.exec('BEGIN');
    try {
      db.prepare(
        `INSERT INTO tenants (id, slug, name, ownerName, phone, plan, status, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, slug, name, ownerName, phone, plan, 'active', now());
      db.prepare(
        `INSERT INTO settings (tenantId, shopName, address, phone, taxId, taxRate, receiptWidth, logoUrl, branches)
         VALUES (?, ?, '', '', '', 15, '80mm', '', '[]')`
      ).run(id, name);
      db.prepare("INSERT INTO meta (tenantId, key, value) VALUES (?, 'invoice_next', '1')").run(id);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    return queries.findTenantById(id);
  },
  updateTenant: (id, fields) => applyUpdate('tenants', fields, TENANT_FIELDS, 'id = ?', [id]),

  // ---- users ----
  allUsers: (tenantId) =>
    db
      .prepare('SELECT * FROM users WHERE tenantId = ? ORDER BY createdAt')
      .all(tenantId)
      .map((r) => unbool({ ...r })),
  activeUsers: (tenantId) =>
    db
      .prepare('SELECT * FROM users WHERE tenantId = ? AND active = 1 ORDER BY createdAt')
      .all(tenantId)
      .map((r) => unbool({ ...r })),
  findUserByUsername: (tenantId, username) => {
    const r = db
      .prepare('SELECT * FROM users WHERE tenantId = ? AND username = ?')
      .get(tenantId, String(username || '').trim());
    return r ? unbool({ ...r }) : undefined;
  },
  /** Used at login when the client does not send a store code. */
  findUsersByUsername: (username) =>
    db
      .prepare(
        `SELECT u.*, t.status AS tenantStatus
           FROM users u
           JOIN tenants t ON t.id = u.tenantId
          WHERE u.username = ? AND u.active = 1`
      )
      .all(String(username || '').trim())
      .map(({ tenantStatus, ...u }) => ({ ...unbool(u), tenantStatus })),
  findUserById: (tenantId, id) => {
    const r = db
      .prepare('SELECT * FROM users WHERE tenantId = ? AND id = ?')
      .get(tenantId, String(id || ''));
    return r ? unbool({ ...r }) : undefined;
  },
  insertUser: (u) => {
    db.prepare(
      `INSERT INTO users (id, tenantId, username, password, displayName, role, active, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      u.id,
      u.tenantId,
      String(u.username || '').trim(),
      u.password,
      u.displayName || '',
      u.role || 'cashier',
      bool(u.active !== false),
      u.createdAt || now()
    );
    return queries.findUserById(u.tenantId, u.id);
  },
  updateUser: (tenantId, id, fields) =>
    applyUpdate('users', fields, USER_FIELDS, 'tenantId = ? AND id = ?', [tenantId, id]),
  deactivateUser: (tenantId, id) =>
    db.prepare('UPDATE users SET active = 0 WHERE tenantId = ? AND id = ?').run(tenantId, id),

  // ---- products ----
  allProducts: (tenantId) =>
    db
      .prepare('SELECT * FROM products WHERE tenantId = ? ORDER BY createdAt')
      .all(tenantId)
      .map((r) => unbool({ ...r })),
  activeProducts: (tenantId) =>
    db
      .prepare('SELECT * FROM products WHERE tenantId = ? AND active = 1 ORDER BY createdAt')
      .all(tenantId)
      .map((r) => unbool({ ...r })),
  findProductById: (tenantId, id) => {
    const r = db
      .prepare('SELECT * FROM products WHERE tenantId = ? AND id = ?')
      .get(tenantId, String(id || ''));
    return r ? unbool({ ...r }) : undefined;
  },
  insertProduct: (p) => {
    db.prepare(
      `INSERT INTO products (id, tenantId, name, price, description, sku, barcode, imageUrl, active, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      p.id,
      p.tenantId,
      p.name || '',
      Number(p.price) || 0,
      p.description || '',
      p.sku || '',
      p.barcode || '',
      p.imageUrl || '',
      bool(p.active !== false),
      p.createdAt || now()
    );
  },
  updateProduct: (tenantId, id, fields) =>
    applyUpdate('products', fields, PRODUCT_FIELDS, 'tenantId = ? AND id = ?', [tenantId, id]),
  deleteProduct: (tenantId, id) =>
    db.prepare('DELETE FROM products WHERE tenantId = ? AND id = ?').run(tenantId, id),
  toggleProduct: (tenantId, id) =>
    db
      .prepare('UPDATE products SET active = 1 - active WHERE tenantId = ? AND id = ?')
      .run(tenantId, id),

  // ---- invoices ----
  allInvoices: (tenantId) =>
    db
      .prepare('SELECT * FROM invoices WHERE tenantId = ? ORDER BY invoiceNumber DESC')
      .all(tenantId)
      .map((r) => withItems({ ...r })),
  findInvoiceById: (tenantId, id) => {
    const r = db
      .prepare('SELECT * FROM invoices WHERE tenantId = ? AND id = ?')
      .get(tenantId, String(id || ''));
    return r ? withItems({ ...r }) : undefined;
  },
  nextInvoiceNumber: (tenantId) => {
    const row = db
      .prepare("SELECT value FROM meta WHERE tenantId = ? AND key = 'invoice_next'")
      .get(tenantId);
    if (row) return Number(row.value);
    const maxRow = db
      .prepare('SELECT MAX(invoiceNumber) AS m FROM invoices WHERE tenantId = ?')
      .get(tenantId);
    const next = Number(maxRow && maxRow.m ? maxRow.m : 0) + 1;
    db.prepare(
      "INSERT OR REPLACE INTO meta (tenantId, key, value) VALUES (?, 'invoice_next', ?)"
    ).run(tenantId, String(next));
    return next;
  },
  insertInvoice: (inv) => {
    const insertInv = db.prepare(
      `INSERT INTO invoices (id, tenantId, invoiceNumber, subtotal, discount, taxRate, taxAmount, total,
                             paymentMethod, cashierName, customerName, customerPhone, guestsCount, reservedAt, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertItem = db.prepare(
      `INSERT INTO invoice_items (tenantId, invoiceId, productId, productName, quantity, unitPrice, total)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const bump = db.prepare("UPDATE meta SET value = ? WHERE tenantId = ? AND key = 'invoice_next'");
    db.exec('BEGIN');
    try {
      insertInv.run(
        inv.id,
        inv.tenantId,
        inv.invoiceNumber,
        inv.subtotal,
        inv.discount,
        inv.taxRate,
        inv.taxAmount,
        inv.total,
        inv.paymentMethod || '',
        inv.cashierName || '',
        inv.customerName || '',
        inv.customerPhone || '',
        Number(inv.guestsCount) || 0,
        inv.reservedAt || '',
        inv.createdAt || now()
      );
      for (const it of inv.items || []) {
        insertItem.run(
          inv.tenantId,
          inv.id,
          it.productId ? String(it.productId) : '',
          it.productName || '',
          Number(it.quantity) || 0,
          Number(it.unitPrice) || 0,
          Number(it.total) || 0
        );
      }
      bump.run(String(inv.invoiceNumber + 1), inv.tenantId);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  },
  deleteInvoice: (tenantId, id) => {
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM invoice_items WHERE tenantId = ? AND invoiceId = ?').run(tenantId, id);
      const result = db
        .prepare('DELETE FROM invoices WHERE tenantId = ? AND id = ?')
        .run(tenantId, id);
      db.exec('COMMIT');
      return result.changes;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  },

  // ---- settings ----
  getSettings: (tenantId) => {
    const r = db.prepare('SELECT * FROM settings WHERE tenantId = ?').get(tenantId);
    if (!r) return null;
    const { tenantId: _tid, branches, ...rest } = r;
    try {
      rest.branches = JSON.parse(branches || '[]');
    } catch {
      rest.branches = [];
    }
    return rest;
  },
  updateSettings: (tenantId, patch) => {
    const current = db.prepare('SELECT tenantId FROM settings WHERE tenantId = ?').get(tenantId);
    if (!current) {
      db.prepare(
        `INSERT INTO settings (tenantId, shopName, address, phone, taxId, taxRate, receiptWidth, logoUrl, branches)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        tenantId,
        patch.shopName || '',
        patch.address || '',
        patch.phone || '',
        patch.taxId || '',
        Number(patch.taxRate) || 0,
        patch.receiptWidth || '80mm',
        patch.logoUrl || '',
        JSON.stringify(patch.branches || [])
      );
      return queries.getSettings(tenantId);
    }
    const fields = {};
    for (const c of SETTINGS_FIELDS) {
      if (c in patch) fields[c] = c === 'branches' ? JSON.stringify(patch.branches || []) : patch[c];
    }
    applyUpdate('settings', fields, SETTINGS_FIELDS, 'tenantId = ?', [tenantId]);
    return queries.getSettings(tenantId);
  },

  // ---- expenses ----
  allExpenses: (tenantId) =>
    db
      .prepare('SELECT * FROM expenses WHERE tenantId = ? ORDER BY createdAt DESC')
      .all(tenantId)
      .map((r) => ({ ...r })),
  insertExpense: (e) => {
    db.prepare(
      `INSERT INTO expenses (id, tenantId, title, amount, branchId, branchName, description, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      e.id,
      e.tenantId,
      e.title || '',
      Number(e.amount) || 0,
      e.branchId || '',
      e.branchName || '',
      e.description || '',
      e.createdAt || now()
    );
  },
  deleteExpense: (tenantId, id) =>
    db.prepare('DELETE FROM expenses WHERE tenantId = ? AND id = ?').run(tenantId, id)
};

module.exports = { db, queries, DB_PATH, DATA_DIR };
