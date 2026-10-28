const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'pos.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// ==================== SCHEMA ====================
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    displayName TEXT DEFAULT '',
    role TEXT DEFAULT 'cashier',
    active INTEGER DEFAULT 1,
    createdAt TEXT
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
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
    invoiceNumber INTEGER UNIQUE NOT NULL,
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
    createdAt TEXT
  );

  CREATE TABLE IF NOT EXISTS invoice_items (
    rowid INTEGER PRIMARY KEY AUTOINCREMENT,
    invoiceId TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    productId TEXT DEFAULT '',
    productName TEXT DEFAULT '',
    quantity REAL DEFAULT 0,
    unitPrice REAL DEFAULT 0,
    total REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    title TEXT DEFAULT '',
    amount REAL DEFAULT 0,
    branchId TEXT DEFAULT '',
    branchName TEXT DEFAULT '',
    description TEXT DEFAULT '',
    createdAt TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
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
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// ==================== ROW MAPPERS ====================
const bool = (v) => (v ? 1 : 0);
const unbool = (row) => {
  if (row && 'active' in row) row.active = !!row.active;
  return row;
};

function getInvoiceItems(invoiceId) {
  return db
    .prepare(
      'SELECT productId, productName, quantity, unitPrice, total FROM invoice_items WHERE invoiceId = ? ORDER BY rowid'
    )
    .all(invoiceId)
    .map((r) => ({ ...r }));
}

function withItems(invoice) {
  if (!invoice) return invoice;
  return { ...invoice, items: getInvoiceItems(invoice.id) };
}

// ==================== ONE-TIME MIGRATION FROM JSON ====================
function readJsonFile(filename) {
  const fp = path.join(DATA_DIR, filename);
  try {
    if (fs.existsSync(fp)) return JSON.parse(fs.readFileSync(fp, 'utf-8'));
  } catch (e) {
    console.error(`Migration: error reading ${filename}:`, e.message);
  }
  return null;
}

function tableEmpty(table) {
  return db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c === 0;
}

function migrateFromJson() {
  // Users
  if (tableEmpty('users')) {
    const users = readJsonFile('users.json');
    if (Array.isArray(users) && users.length) {
      const stmt = db.prepare(
        'INSERT OR IGNORE INTO users (id, username, password, displayName, role, active, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      for (const u of users) {
        stmt.run(
          String(u.id),
          u.username,
          u.password,
          u.displayName || '',
          u.role || 'cashier',
          bool(u.active !== false),
          u.createdAt || new Date().toISOString()
        );
      }
      console.log(`📦 Migrated ${users.length} users from users.json`);
    }
  }

  // Products
  if (tableEmpty('products')) {
    const products = readJsonFile('products.json');
    if (Array.isArray(products) && products.length) {
      const stmt = db.prepare(
        'INSERT OR IGNORE INTO products (id, name, price, description, sku, barcode, imageUrl, active, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const p of products) {
        stmt.run(
          String(p.id),
          p.name || '',
          Number(p.price) || 0,
          p.description || '',
          p.sku || '',
          p.barcode || '',
          p.imageUrl || '',
          bool(p.active !== false),
          p.createdAt || new Date().toISOString()
        );
      }
      console.log(`📦 Migrated ${products.length} products from products.json`);
    }
  }

  // Invoices (+ items) and counter
  if (tableEmpty('invoices')) {
    const invoices = readJsonFile('invoices.json');
    if (Array.isArray(invoices) && invoices.length) {
      const invStmt = db.prepare(
        'INSERT OR IGNORE INTO invoices (id, invoiceNumber, subtotal, discount, taxRate, taxAmount, total, paymentMethod, cashierName, customerName, customerPhone, guestsCount, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      const itemStmt = db.prepare(
        'INSERT INTO invoice_items (invoiceId, productId, productName, quantity, unitPrice, total) VALUES (?, ?, ?, ?, ?, ?)'
      );
      let maxNumber = 0;
      for (const inv of invoices) {
        invStmt.run(
          String(inv.id),
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
          inv.createdAt || new Date().toISOString()
        );
        if (Number(inv.invoiceNumber) > maxNumber) maxNumber = Number(inv.invoiceNumber);
        for (const it of inv.items || []) {
          itemStmt.run(
            String(inv.id),
            it.productId ? String(it.productId) : '',
            it.productName || '',
            Number(it.quantity) || 0,
            Number(it.unitPrice) || 0,
            Number(it.total) || 0
          );
        }
      }
      // Seed the counter from migrated data (max+1), unless a counter file says higher
      const counterFile = readJsonFile('invoice_counter.json');
      const next = Math.max(
        maxNumber + 1,
        counterFile && Number(counterFile.next) ? Number(counterFile.next) : 1
      );
      db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(
        'invoice_next',
        String(next)
      );
      console.log(`📦 Migrated ${invoices.length} invoices from invoices.json (next number: ${next})`);
    }
  }

  // Expenses (file may not exist yet — created on first use)
  if (tableEmpty('expenses')) {
    const expenses = readJsonFile('expenses.json');
    if (Array.isArray(expenses) && expenses.length) {
      const stmt = db.prepare(
        'INSERT OR IGNORE INTO expenses (id, title, amount, branchId, branchName, description, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      for (const e of expenses) {
        stmt.run(
          String(e.id),
          e.title || '',
          Number(e.amount) || 0,
          e.branchId || '',
          e.branchName || '',
          e.description || '',
          e.createdAt || new Date().toISOString()
        );
      }
      console.log(`📦 Migrated ${expenses.length} expenses from expenses.json`);
    }
  }

  // Settings
  if (tableEmpty('settings')) {
    const s = readJsonFile('settings.json');
    if (s && typeof s === 'object') {
      db.prepare(
        'INSERT OR IGNORE INTO settings (id, shopName, address, phone, taxId, taxRate, receiptWidth, logoUrl, branches) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
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

  // Ensure counter row exists
  const counter = db.prepare("SELECT value FROM meta WHERE key = 'invoice_next'").get();
  if (!counter) {
    const maxRow = db.prepare('SELECT MAX(invoiceNumber) AS m FROM invoices').get();
    const next = (maxRow && Number(maxRow.m) ? Number(maxRow.m) : 0) + 1;
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('invoice_next', String(next));
  }
}

function ensureInvoiceCustomerColumns() {
  const cols = db.prepare('PRAGMA table_info(invoices)').all().map((c) => c.name);
  if (!cols.includes('customerName')) db.exec("ALTER TABLE invoices ADD COLUMN customerName TEXT DEFAULT ''");
  if (!cols.includes('customerPhone')) db.exec("ALTER TABLE invoices ADD COLUMN customerPhone TEXT DEFAULT ''");
  if (!cols.includes('guestsCount')) db.exec('ALTER TABLE invoices ADD COLUMN guestsCount REAL DEFAULT 0');
  if (!cols.includes('reservedAt')) db.exec("ALTER TABLE invoices ADD COLUMN reservedAt TEXT DEFAULT ''");
}

ensureInvoiceCustomerColumns();
migrateFromJson();

// ==================== QUERY API ====================
const queries = {
  // ---- users ----
  allUsers: () => db.prepare('SELECT * FROM users ORDER BY createdAt').all().map((r) => unbool({ ...r })),
  activeUsers: () =>
    db.prepare('SELECT * FROM users WHERE active = 1 ORDER BY createdAt').all().map((r) => unbool({ ...r })),
  findUserByUsername: (username) => {
    const r = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    return r ? unbool({ ...r }) : undefined;
  },
  findUserById: (id) => {
    const r = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return r ? unbool({ ...r }) : undefined;
  },
  insertUser: (u) => {
    db.prepare(
      'INSERT INTO users (id, username, password, displayName, role, active, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(u.id, u.username, u.password, u.displayName || '', u.role || 'cashier', bool(u.active !== false), u.createdAt);
  },
  updateUser: (id, fields) => {
    const keys = Object.keys(fields);
    if (!keys.length) return;
    const set = keys.map((k) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE users SET ${set} WHERE id = ?`).run(...keys.map((k) => fields[k]), id);
  },
  deactivateUser: (id) => db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(id),

  // ---- products ----
  allProducts: () => db.prepare('SELECT * FROM products ORDER BY createdAt').all().map((r) => unbool({ ...r })),
  activeProducts: () =>
    db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY createdAt').all().map((r) => unbool({ ...r })),
  findProductById: (id) => {
    const r = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    return r ? unbool({ ...r }) : undefined;
  },
  insertProduct: (p) => {
    db.prepare(
      'INSERT INTO products (id, name, price, description, sku, barcode, imageUrl, active, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      p.id, p.name || '', Number(p.price) || 0, p.description || '', p.sku || '',
      p.barcode || '', p.imageUrl || '', bool(p.active !== false), p.createdAt
    );
  },
  updateProduct: (id, fields) => {
    const keys = Object.keys(fields);
    if (!keys.length) return;
    const set = keys.map((k) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE products SET ${set} WHERE id = ?`).run(...keys.map((k) => fields[k]), id);
  },
  deleteProduct: (id) => db.prepare('DELETE FROM products WHERE id = ?').run(id),
  toggleProduct: (id) => db.prepare('UPDATE products SET active = 1 - active WHERE id = ?').run(id),

  // ---- invoices ----
  allInvoices: () =>
    db.prepare('SELECT * FROM invoices ORDER BY invoiceNumber DESC').all().map((r) => withItems({ ...r })),
  findInvoiceById: (id) => {
    const r = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
    return r ? withItems({ ...r }) : undefined;
  },
  nextInvoiceNumber: () => Number(db.prepare("SELECT value FROM meta WHERE key = 'invoice_next'").get().value),
  insertInvoice: (inv) => {
    const insertInv = db.prepare(
      'INSERT INTO invoices (id, invoiceNumber, subtotal, discount, taxRate, taxAmount, total, paymentMethod, cashierName, customerName, customerPhone, guestsCount, reservedAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const insertItem = db.prepare(
      'INSERT INTO invoice_items (invoiceId, productId, productName, quantity, unitPrice, total) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const bump = db.prepare("UPDATE meta SET value = ? WHERE key = 'invoice_next'");
    db.exec('BEGIN');
    try {
      insertInv.run(
        inv.id, inv.invoiceNumber, inv.subtotal, inv.discount,
        inv.taxRate, inv.taxAmount, inv.total,
        inv.paymentMethod || '', inv.cashierName || '',
        inv.customerName || '', inv.customerPhone || '', Number(inv.guestsCount) || 0,
        inv.reservedAt || '', inv.createdAt
      );
      for (const it of inv.items || []) {
        insertItem.run(
          inv.id, it.productId ? String(it.productId) : '', it.productName || '',
          Number(it.quantity) || 0, Number(it.unitPrice) || 0, Number(it.total) || 0
        );
      }
      bump.run(String(inv.invoiceNumber + 1));
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  },
  deleteInvoice: (id) => {
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM invoice_items WHERE invoiceId = ?').run(id);
      const result = db.prepare('DELETE FROM invoices WHERE id = ?').run(id);
      db.exec('COMMIT');
      return result.changes;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  },

  // ---- settings ----
  getSettings: () => {
    const r = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    if (!r) return null;
    const { id, branches, ...rest } = r;
    try {
      rest.branches = JSON.parse(branches || '[]');
    } catch {
      rest.branches = [];
    }
    return rest;
  },
  updateSettings: (patch) => {
    const cols = ['shopName', 'address', 'phone', 'taxId', 'taxRate', 'receiptWidth', 'logoUrl', 'branches'];
    const current = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    if (!current) {
      db.prepare(
        'INSERT INTO settings (id, shopName, address, phone, taxId, taxRate, receiptWidth, logoUrl, branches) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        patch.shopName || '', patch.address || '', patch.phone || '', patch.taxId || '',
        Number(patch.taxRate) || 0, patch.receiptWidth || '80mm', patch.logoUrl || '',
        JSON.stringify(patch.branches || [])
      );
    } else {
      const fields = {};
      for (const c of cols) {
        if (c in patch) fields[c] = c === 'branches' ? JSON.stringify(patch.branches || []) : patch[c];
      }
      const keys = Object.keys(fields);
      if (keys.length) {
        const set = keys.map((k) => `${k} = ?`).join(', ');
        db.prepare(`UPDATE settings SET ${set} WHERE id = 1`).run(...keys.map((k) => fields[k]));
      }
    }
    return queries.getSettings();
  },

  // ---- expenses ----
  allExpenses: () => db.prepare('SELECT * FROM expenses ORDER BY createdAt DESC').all().map((r) => ({ ...r })),
  insertExpense: (e) => {
    db.prepare(
      'INSERT INTO expenses (id, title, amount, branchId, branchName, description, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(e.id, e.title || '', Number(e.amount) || 0, e.branchId || '', e.branchName || '', e.description || '', e.createdAt);
  },
  deleteExpense: (id) => db.prepare('DELETE FROM expenses WHERE id = ?').run(id),
};

module.exports = { db, queries, DB_PATH, DATA_DIR };
