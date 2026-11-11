const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { queries, DB_PATH } = require('./db');
const tenancy = require('./tenancy');

const app = express();
// Behind a TLS proxy (Azure) the forwarded protocol is needed for absolute logo URLs.
app.set('trust proxy', true);
const PORT = (process.env.PORT && process.env.PORT !== '0') ? parseInt(process.env.PORT) : 3000;

const generateId = () => Date.now().toString(36) + crypto.randomBytes(4).toString('hex');

// ==================== PASSWORDS ====================
// New passwords use scrypt. Legacy rows (sha256 hex from the first release or
// the JSON files) still verify, and are upgraded on their next login.
const SCRYPT_PREFIX = 'scrypt$';

function scryptAsync(password, salt, keylen) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password), salt, keylen, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `${SCRYPT_PREFIX}${salt.toString('hex')}$${key.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  if (!stored) return false;

  if (stored.startsWith(SCRYPT_PREFIX)) {
    const [, saltHex, keyHex] = stored.split('$');
    if (!saltHex || !keyHex) return false;
    const expected = Buffer.from(keyHex, 'hex');
    const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }

  const legacy = crypto.createHash('sha256').update(String(password)).digest('hex');
  if (legacy.length !== stored.length) return false;
  return crypto.timingSafeEqual(Buffer.from(legacy), Buffer.from(stored));
}

const isLegacyHash = (stored) => !String(stored || '').startsWith(SCRYPT_PREFIX);

// ==================== MIDDLEWARE ====================
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'dist/freebuff-pos/browser')));

// Uploaded store logos are stored on disk and served read-only from /uploads.
const UPLOADS_DIR = path.join(__dirname, 'data', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d' }));

// CORS for dev (the Angular dev server runs on another origin)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const api = express.Router();

// ==================== PUBLIC: SAAS ONBOARDING ====================

// Password an operator must type on the sign-up form to create a new store.
const NEW_STORE_ADMIN_PASSWORD = 'Admin@NewStore2026';

api.get('/health', (req, res) => res.json({ ok: true }));

// Lets the login screen show the store name for a code the user typed.
api.get('/tenants/lookup', (req, res) => {
  const tenant = queries.findTenantBySlug(req.query.slug || '');
  if (!tenant || tenant.status !== 'active') return res.json({ exists: false });
  res.json({ exists: true, name: tenant.name, slug: tenant.slug });
});

// Creates a new client account: its own tenant, its own owner user, its own settings.
api.post('/auth/register', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const storeName = String(body.storeName || '').trim();
  const ownerName = String(body.ownerName || '').trim();
  const phone = String(body.phone || '').trim();
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const adminPassword = String(body.adminPassword || '');

  if (adminPassword !== NEW_STORE_ADMIN_PASSWORD) {
    return res.status(403).json({
      field: 'adminPassword',
      message: 'كلمة مرور الإدارة غير صحيحة'
    });
  }
  if (storeName.length < 2) {
    return res.status(400).json({ field: 'storeName', message: 'اسم المتجر قصير جداً' });
  }
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    return res.status(400).json({
      field: 'username',
      message: 'اسم المستخدم 3 أحرف على الأقل، حروف إنجليزية أو أرقام'
    });
  }
  if (password.length < 6) {
    return res.status(400).json({ field: 'password', message: 'كلمة المرور 6 أحرف على الأقل' });
  }

  let slug = tenancy.normalizeSlug(body.storeCode || storeName);
  if (!slug) slug = `store-${crypto.randomBytes(3).toString('hex')}`;
  if (!/^[a-z0-9][a-z0-9-]{1,29}$/.test(slug)) {
    return res.status(400).json({
      field: 'storeCode',
      message: 'رمز المتجر: حروف إنجليزية صغيرة أو أرقام أو شرطات (2-30 حرفاً)'
    });
  }
  if (tenancy.RESERVED_SLUGS.has(slug)) {
    return res.status(409).json({ field: 'storeCode', message: 'رمز المتجر محجوز، اختر رمزاً آخر' });
  }
  if (queries.findTenantBySlug(slug)) {
    return res.status(409).json({ field: 'storeCode', message: 'رمز المتجر مستخدم بالفعل' });
  }

  const tenant = queries.createTenant({ name: storeName, slug, ownerName, phone });

  const owner = queries.insertUser({
    id: generateId(),
    tenantId: tenant.id,
    username,
    password: await hashPassword(password),
    displayName: ownerName || username,
    role: 'admin',
    active: true
  });

  res.status(201).json({
    token: tenancy.issueToken(owner, tenant),
    user: tenancy.publicUser(owner),
    tenant: tenancy.publicTenant(tenant)
  });
}));

// Login can be scoped by store code, or resolved automatically when the
// username is unique across all tenants.
api.post('/auth/login', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const storeCode = String(body.storeCode || '').trim();

  if (!username || !password) {
    return res.status(400).json({ message: 'أدخل اسم المستخدم وكلمة المرور' });
  }

  let tenant = null;
  let user = null;

  if (storeCode) {
    tenant = queries.findTenantBySlug(storeCode);
    if (tenant) user = queries.findUserByUsername(tenant.id, username);
  } else {
    const matches = queries.findUsersByUsername(username);
    if (matches.length > 1) {
      return res.status(409).json({
        code: 'STORE_REQUIRED',
        message: 'اسم المستخدم موجود في أكثر من متجر، أدخل رمز المتجر'
      });
    }
    if (matches.length === 1) {
      user = matches[0];
      tenant = queries.findTenantById(user.tenantId);
    }
  }

  if (!user || !user.active || !(await verifyPassword(password, user.password))) {
    return res.status(401).json({ message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }
  if (!tenant) {
    return res.status(401).json({ message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }
  if (tenant.status !== 'active') {
    return res.status(403).json({ message: 'هذا المتجر غير مفعّل حالياً' });
  }

  // Transparent upgrade of legacy password hashes.
  if (isLegacyHash(user.password)) {
    queries.updateUser(tenant.id, user.id, { password: await hashPassword(password) });
  }

  res.json({
    token: tenancy.issueToken(user, tenant),
    user: tenancy.publicUser(user),
    tenant: tenancy.publicTenant(tenant)
  });
}));

// ==================== AUTHENTICATED: everything below is tenant-scoped ====================
api.use(tenancy.authenticate);

api.get('/auth/me', (req, res) => {
  res.json({
    user: tenancy.publicUser(req.user),
    tenant: tenancy.publicTenant(req.tenant)
  });
});

// ==================== USERS (per tenant) ====================

api.get('/users', (req, res) => {
  res.json(queries.allUsers(req.tenant.id).map(tenancy.publicUser));
});

api.get('/users/active', (req, res) => {
  res.json(queries.activeUsers(req.tenant.id).map(tenancy.publicUser));
});

api.post('/users', tenancy.requireAdmin, asyncRoute(async (req, res) => {
  const body = req.body || {};
  const username = String(body.username || '').trim();

  if (!username) {
    return res.status(400).json({ message: 'اسم المستخدم مطلوب' });
  }
  if (queries.findUserByUsername(req.tenant.id, username)) {
    return res.status(400).json({ message: 'اسم المستخدم موجود بالفعل في هذا المتجر' });
  }

  const user = queries.insertUser({
    id: generateId(),
    tenantId: req.tenant.id,
    username,
    password: await hashPassword(body.password || '123456'),
    displayName: String(body.displayName || '').trim(),
    role: body.role === 'admin' ? 'admin' : 'cashier',
    active: true
  });

  res.json(tenancy.publicUser(user));
}));

api.put('/users/:id', tenancy.requireAdmin, asyncRoute(async (req, res) => {
  const existing = queries.findUserById(req.tenant.id, req.params.id);
  if (!existing) {
    return res.status(404).json({ message: 'المستخدم غير موجود' });
  }

  const body = req.body || {};
  const fields = {};

  if ('username' in body) {
    const username = String(body.username || '').trim();
    if (!username) return res.status(400).json({ message: 'اسم المستخدم مطلوب' });
    const clash = queries.findUserByUsername(req.tenant.id, username);
    if (clash && clash.id !== existing.id) {
      return res.status(400).json({ message: 'اسم المستخدم موجود بالفعل في هذا المتجر' });
    }
    fields.username = username;
  }
  if ('displayName' in body) fields.displayName = String(body.displayName || '');
  if ('role' in body) fields.role = body.role === 'admin' ? 'admin' : 'cashier';
  if ('active' in body) fields.active = body.active ? 1 : 0;
  if (body.password) fields.password = await hashPassword(body.password);

  // Never let a tenant lock itself out of its own admin panel.
  const admins = queries.allUsers(req.tenant.id).filter((u) => u.role === 'admin' && u.active);
  const losingAdmin =
    existing.role === 'admin' &&
    (fields.role === 'cashier' || fields.active === 0) &&
    admins.length <= 1;
  if (losingAdmin) {
    return res.status(400).json({ message: 'لا يمكن إيقاف أو خفض آخر مدير للمتجر' });
  }
  if (existing.id === req.user.id && fields.active === 0) {
    return res.status(400).json({ message: 'لا يمكنك إيقاف حسابك الحالي' });
  }

  queries.updateUser(req.tenant.id, existing.id, fields);
  res.json(tenancy.publicUser(queries.findUserById(req.tenant.id, existing.id)));
}));

api.delete('/users/:id', tenancy.requireAdmin, (req, res) => {
  const existing = queries.findUserById(req.tenant.id, req.params.id);
  if (!existing) {
    return res.status(404).json({ message: 'المستخدم غير موجود' });
  }
  if (existing.id === req.user.id) {
    return res.status(400).json({ message: 'لا يمكنك حذف حسابك الحالي' });
  }
  queries.deactivateUser(req.tenant.id, existing.id);
  res.json({ success: true });
});

// Seeds demo staff inside the current tenant only.
api.post('/users/seed', tenancy.requireAdmin, asyncRoute(async (req, res) => {
  if (queries.allUsers(req.tenant.id).length > 0) {
    return res.json({ seeded: false });
  }

  const now = new Date().toISOString();
  queries.insertUser({
    id: generateId(), tenantId: req.tenant.id, username: 'admin',
    password: await hashPassword('123456'), displayName: 'المدير',
    role: 'admin', active: true, createdAt: now
  });
  queries.insertUser({
    id: generateId(), tenantId: req.tenant.id, username: 'cashier',
    password: await hashPassword('123456'), displayName: 'بائع',
    role: 'cashier', active: true, createdAt: now
  });

  res.json({ seeded: true });
}));

// ==================== PRODUCTS (per tenant) ====================

api.get('/products', (req, res) => {
  res.json(queries.allProducts(req.tenant.id));
});

api.get('/products/active', (req, res) => {
  res.json(queries.activeProducts(req.tenant.id));
});

api.get('/products/:id', (req, res) => {
  const product = queries.findProductById(req.tenant.id, req.params.id);
  if (!product) return res.status(404).json({ message: 'المنتج غير موجود' });
  res.json(product);
});

api.post('/products', (req, res) => {
  const body = req.body || {};
  const product = {
    id: generateId(),
    tenantId: req.tenant.id,
    name: body.name || '',
    price: Number(body.price) || 0,
    description: body.description || '',
    sku: body.sku || '',
    barcode: body.barcode || '',
    imageUrl: body.imageUrl || '',
    active: body.active !== false,
    createdAt: new Date().toISOString()
  };

  queries.insertProduct(product);
  res.json(queries.findProductById(req.tenant.id, product.id));
});

api.put('/products/:id', (req, res) => {
  const existing = queries.findProductById(req.tenant.id, req.params.id);
  if (!existing) {
    return res.status(404).json({ message: 'المنتج غير موجود' });
  }

  const body = { ...(req.body || {}) };
  delete body.id;
  delete body.tenantId;
  if ('active' in body) body.active = body.active ? 1 : 0;
  if ('price' in body) body.price = Number(body.price) || 0;

  queries.updateProduct(req.tenant.id, existing.id, body);
  res.json(queries.findProductById(req.tenant.id, existing.id));
});

api.delete('/products/:id', (req, res) => {
  const deleted = queries.deleteProduct(req.tenant.id, req.params.id);
  if (!deleted.changes) {
    return res.status(404).json({ message: 'المنتج غير موجود' });
  }
  res.json({ success: true });
});

api.patch('/products/:id/toggle', (req, res) => {
  const existing = queries.findProductById(req.tenant.id, req.params.id);
  if (!existing) {
    return res.status(404).json({ message: 'المنتج غير موجود' });
  }
  queries.toggleProduct(req.tenant.id, existing.id);
  res.json(queries.findProductById(req.tenant.id, existing.id));
});

api.post('/products/seed', tenancy.requireAdmin, (req, res) => {
  if (queries.allProducts(req.tenant.id).length > 0) {
    return res.json({ seeded: false });
  }

  const defaults = [
    { name: 'حليب طازج', price: 6.50, description: 'حليب طازج كامل الدسم', sku: 'P001', barcode: '6281000000001', imageUrl: '', active: true },
    { name: 'جبنة بيضاء', price: 15.00, description: 'جبنة بيضاء طازجة 400 جرام', sku: 'P008', barcode: '6281000000008', imageUrl: '', active: true },
    { name: 'خبز أبيض', price: 1.00, description: 'ربطة خبز أبيض طازج', sku: 'P002', barcode: '6281000000002', imageUrl: '', active: true },
    { name: 'زيت زيتون', price: 25.00, description: 'زيت زيتون بكر ممتاز 500 مل', sku: 'P003', barcode: '6281000000003', imageUrl: '', active: true },
    { name: 'أرز بسمتي', price: 18.00, description: 'أرز بسمتي هندي 1 كجم', sku: 'P004', barcode: '6281000000004', imageUrl: '', active: true },
    { name: 'سكر أبيض', price: 5.00, description: 'سكر أبيض ناعم 1 كجم', sku: 'P005', barcode: '6281000000005', imageUrl: '', active: true },
    { name: 'معلبات طماطم', price: 3.50, description: 'علبة طماطم مقشرة 400 جرام', sku: 'P006', barcode: '6281000000006', imageUrl: '', active: true },
    { name: 'مكسرات مشكلة', price: 35.00, description: 'مكسرات مشكلة محمصة 250 جرام', sku: 'P007', barcode: '6281000000007', imageUrl: '', active: true }
  ];

  const now = new Date().toISOString();
  for (const d of defaults) {
    queries.insertProduct({ ...d, id: generateId(), tenantId: req.tenant.id, createdAt: now });
  }
  res.json({ seeded: true });
});

// ==================== INVOICES (per tenant, own numbering) ====================

api.get('/invoices', (req, res) => {
  res.json(queries.allInvoices(req.tenant.id));
});

api.get('/invoices/counter', (req, res) => {
  res.json({ next: queries.nextInvoiceNumber(req.tenant.id) });
});

api.get('/invoices/:id', (req, res) => {
  const invoice = queries.findInvoiceById(req.tenant.id, req.params.id);
  if (!invoice) return res.status(404).json({ message: 'الفاتورة غير موجودة' });
  res.json(invoice);
});

api.post('/invoices', (req, res) => {
  const body = req.body || {};

  const invoice = {
    // Always generated server-side: a client can never pick another tenant's id.
    id: generateId(),
    tenantId: req.tenant.id,
    invoiceNumber: queries.nextInvoiceNumber(req.tenant.id),
    subtotal: Number(body.subtotal) || 0,
    discount: Number(body.discount) || 0,
    taxRate: Number(body.taxRate) || 0,
    taxAmount: Number(body.taxAmount) || 0,
    total: Number(body.total) || 0,
    paymentMethod: body.paymentMethod || '',
    cashierName: req.user.displayName || req.user.username || '',
    customerName: (body.customerName || '').trim(),
    customerPhone: (body.customerPhone || '').trim(),
    guestsCount: Number(body.guestsCount) || 0,
    reservedAt: body.reservedAt || '',
    createdAt: body.createdAt || new Date().toISOString(),
    items: (body.items || []).map((it) => ({
      productId: it.productId || '',
      productName: it.productName || '',
      quantity: Number(it.quantity) || 0,
      unitPrice: Number(it.unitPrice) || 0,
      total: Number(it.total) || 0
    }))
  };

  queries.insertInvoice(invoice);
  res.json(queries.findInvoiceById(req.tenant.id, invoice.id));
});

api.delete('/invoices/:id', tenancy.requireAdmin, (req, res) => {
  const existing = queries.findInvoiceById(req.tenant.id, req.params.id);
  if (!existing) return res.status(404).json({ message: 'الفاتورة غير موجودة' });

  queries.deleteInvoice(req.tenant.id, existing.id);
  res.json({ success: true });
});

// ==================== SETTINGS (per tenant) ====================

api.get('/settings', (req, res) => {
  res.json(queries.getSettings(req.tenant.id));
});

api.put('/settings', tenancy.requireAdmin, (req, res) => {
  res.json(queries.updateSettings(req.tenant.id, req.body || {}));
});

// ==================== SHOP LOGO (uploaded image) ====================

const LOGO_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg'
};
const MAX_LOGO_BYTES = 3 * 1024 * 1024;

function uploadedLogoName(url) {
  const name = String(url || '').split('/uploads/')[1] || '';
  if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) return '';
  return name;
}

function removeUploadedLogo(url) {
  const name = uploadedLogoName(url);
  if (!name) return;
  fs.rm(path.join(UPLOADS_DIR, name), { force: true }, () => {});
}

function publicLogoUrl(req, fileName) {
  const host = req.get('host') || `localhost:${PORT}`;
  return `${req.protocol}://${host}/uploads/${fileName}`;
}

// Accepts the image as a data URL so no multipart dependency is needed.
api.post('/settings/logo', tenancy.requireAdmin, (req, res) => {
  const dataUrl = String((req.body || {}).dataUrl || '');
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl.trim());
  if (!match) {
    return res.status(400).json({ message: 'الرجاء اختيار ملف صورة صالح' });
  }

  const ext = LOGO_TYPES[match[1].toLowerCase()];
  if (!ext) {
    return res.status(400).json({ message: 'صيغة الصورة غير مدعومة، استخدم PNG أو JPG أو WEBP أو GIF' });
  }

  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!buffer.length) {
    return res.status(400).json({ message: 'ملف الصورة فارغ' });
  }
  if (buffer.length > MAX_LOGO_BYTES) {
    return res.status(400).json({ message: 'حجم الصورة كبير، الحد الأقصى 3 ميجابايت' });
  }

  const fileName = `logo-${req.tenant.slug}-${generateId()}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, fileName), buffer);

  const previous = queries.getSettings(req.tenant.id) || {};
  const updated = queries.updateSettings(req.tenant.id, { logoUrl: publicLogoUrl(req, fileName) });
  removeUploadedLogo(previous.logoUrl);
  res.json(updated);
});

api.delete('/settings/logo', tenancy.requireAdmin, (req, res) => {
  const previous = queries.getSettings(req.tenant.id) || {};
  const updated = queries.updateSettings(req.tenant.id, { logoUrl: '' });
  removeUploadedLogo(previous.logoUrl);
  res.json(updated);
});

// ==================== EXPENSES (per tenant) ====================

api.get('/expenses', (req, res) => {
  res.json(queries.allExpenses(req.tenant.id));
});

api.post('/expenses', (req, res) => {
  const body = req.body || {};
  const settings = queries.getSettings(req.tenant.id) || {};
  const branch = body.branchId
    ? (settings.branches || []).find((b) => b.id === body.branchId)
    : null;

  const expense = {
    id: generateId(),
    tenantId: req.tenant.id,
    title: body.title || '',
    amount: Number(body.amount) || 0,
    branchId: body.branchId || '',
    branchName: branch ? branch.name : '',
    description: body.description || '',
    createdAt: new Date().toISOString()
  };

  queries.insertExpense(expense);
  res.json(expense);
});

api.delete('/expenses/:id', tenancy.requireAdmin, (req, res) => {
  queries.deleteExpense(req.tenant.id, req.params.id);
  res.json({ success: true });
});

api.get('/branches', (req, res) => {
  const settings = queries.getSettings(req.tenant.id) || {};
  res.json((settings.branches || []).filter((b) => b.isActive).map((b) => ({ id: b.id, name: b.name })));
});

app.use('/api', api);

// Errors from the async tenant-scoped routes must never leak internals.
app.use('/api', (err, req, res, next) => {
  console.error('API error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ message: 'حدث خطأ غير متوقع في الخادم' });
});

// A removed or unknown logo must not fall through to the SPA index page.
app.use('/uploads', (req, res) => res.status(404).json({ message: 'الصورة غير موجودة' }));

// SPA fallback
app.get('{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist/freebuff-pos/browser/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🏪 Freebuff POS Server running on http://localhost:${PORT}`);
  console.log(`🗄️  SQLite database: ${DB_PATH}`);
  console.log('🏢 Multi-tenant mode: data is isolated per store\n');
});
