const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { queries, DB_PATH, DATA_DIR } = require('./db');

const app = express();
const PORT = (process.env.PORT && process.env.PORT !== '0') ? parseInt(process.env.PORT) : 3000;

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

async function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'dist/freebuff-pos/browser')));

// CORS for dev
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ==================== USERS ====================

app.get('/api/users', (req, res) => {
  res.json(queries.allUsers());
});

app.get('/api/users/active', (req, res) => {
  res.json(queries.activeUsers());
});

app.post('/api/users/login', async (req, res) => {
  const { username, password } = req.body;
  const hashed = await hashPassword(password);
  const user = queries.findUserByUsername(username);

  if (!user || user.password !== hashed || !user.active) {
    return res.status(401).json({ message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }

  // Return user without password
  const { password: _, ...userWithoutPassword } = user;
  res.json(userWithoutPassword);
});

app.post('/api/users', async (req, res) => {
  if (queries.findUserByUsername(req.body.username)) {
    return res.status(400).json({ message: 'اسم المستخدم موجود بالفعل' });
  }

  const hashed = await hashPassword(req.body.password || '123456');
  const newUser = {
    id: generateId(),
    username: req.body.username,
    password: hashed,
    displayName: req.body.displayName || '',
    role: req.body.role || 'cashier',
    active: true,
    createdAt: new Date().toISOString()
  };

  queries.insertUser(newUser);

  const { password: _, ...result } = newUser;
  res.json(result);
});

app.put('/api/users/:id', async (req, res) => {
  const existing = queries.findUserById(req.params.id);

  if (!existing) {
    return res.status(404).json({ message: 'المستخدم غير موجود' });
  }

  const fields = { ...req.body };
  delete fields.id;
  if (fields.password) {
    fields.password = await hashPassword(fields.password);
  } else {
    delete fields.password;
  }
  if ('active' in fields) fields.active = fields.active ? 1 : 0;

  queries.updateUser(req.params.id, fields);

  const updated = queries.findUserById(req.params.id);
  const { password: _, ...result } = updated;
  res.json(result);
});

app.delete('/api/users/:id', (req, res) => {
  const existing = queries.findUserById(req.params.id);

  if (!existing) {
    return res.status(404).json({ message: 'المستخدم غير موجود' });
  }

  queries.deactivateUser(req.params.id);
  res.json({ success: true });
});

// Seed default users if none exist
app.post('/api/users/seed', async (req, res) => {
  if (queries.allUsers().length > 0) {
    return res.json({ seeded: false });
  }

  const adminHash = await hashPassword('123456');
  const cashierHash = await hashPassword('123456');

  const now = new Date().toISOString();
  queries.insertUser({
    id: generateId(), username: 'admin', password: adminHash,
    displayName: 'المدير', role: 'admin', active: true, createdAt: now
  });
  queries.insertUser({
    id: generateId(), username: 'cashier', password: cashierHash,
    displayName: 'بائع', role: 'cashier', active: true, createdAt: now
  });

  res.json({ seeded: true });
});

// ==================== PRODUCTS ====================

app.get('/api/products', (req, res) => {
  res.json(queries.allProducts());
});

app.get('/api/products/active', (req, res) => {
  res.json(queries.activeProducts());
});

app.get('/api/products/:id', (req, res) => {
  const product = queries.findProductById(req.params.id);
  if (!product) return res.status(404).json({ message: 'المنتج غير موجود' });
  res.json(product);
});

app.post('/api/products', (req, res) => {
  const newProduct = {
    id: generateId(),
    name: req.body.name || '',
    price: Number(req.body.price) || 0,
    description: req.body.description || '',
    sku: req.body.sku || '',
    barcode: req.body.barcode || '',
    imageUrl: req.body.imageUrl || '',
    active: req.body.active !== false,
    createdAt: new Date().toISOString()
  };

  queries.insertProduct(newProduct);
  res.json({ ...newProduct });
});

app.put('/api/products/:id', (req, res) => {
  const existing = queries.findProductById(req.params.id);

  if (!existing) {
    return res.status(404).json({ message: 'المنتج غير موجود' });
  }

  const fields = { ...req.body };
  delete fields.id;
  if ('active' in fields) fields.active = fields.active ? 1 : 0;
  if ('price' in fields) fields.price = Number(fields.price) || 0;

  queries.updateProduct(req.params.id, fields);
  res.json(queries.findProductById(req.params.id));
});

app.delete('/api/products/:id', (req, res) => {
  queries.deleteProduct(req.params.id);
  res.json({ success: true });
});

app.patch('/api/products/:id/toggle', (req, res) => {
  const existing = queries.findProductById(req.params.id);

  if (!existing) {
    return res.status(404).json({ message: 'المنتج غير موجود' });
  }

  queries.toggleProduct(req.params.id);
  res.json(queries.findProductById(req.params.id));
});

// Seed default products
app.post('/api/products/seed', (req, res) => {
  if (queries.allProducts().length > 0) {
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
    queries.insertProduct({ ...d, id: generateId(), createdAt: now });
  }
  res.json({ seeded: true });
});

// ==================== INVOICES ====================

app.get('/api/invoices', (req, res) => {
  res.json(queries.allInvoices());
});

app.get('/api/invoices/counter', (req, res) => {
  res.json({ next: queries.nextInvoiceNumber() });
});

app.get('/api/invoices/:id', (req, res) => {
  const invoice = queries.findInvoiceById(req.params.id);
  if (!invoice) return res.status(404).json({ message: 'الفاتورة غير موجودة' });
  res.json(invoice);
});

app.post('/api/invoices', (req, res) => {
  const next = queries.nextInvoiceNumber();

  const invoice = {
    id: req.body.id || generateId(),
    invoiceNumber: next,
    subtotal: Number(req.body.subtotal) || 0,
    discount: Number(req.body.discount) || 0,
    taxRate: Number(req.body.taxRate) || 0,
    taxAmount: Number(req.body.taxAmount) || 0,
    total: Number(req.body.total) || 0,
    paymentMethod: req.body.paymentMethod || '',
    cashierName: req.body.cashierName || '',
    customerName: (req.body.customerName || '').trim(),
    customerPhone: (req.body.customerPhone || '').trim(),
    guestsCount: Number(req.body.guestsCount) || 0,
    createdAt: req.body.createdAt || new Date().toISOString(),
    items: (req.body.items || []).map((it) => ({
      productId: it.productId || '',
      productName: it.productName || '',
      quantity: Number(it.quantity) || 0,
      unitPrice: Number(it.unitPrice) || 0,
      total: Number(it.total) || 0
    }))
  };

  queries.insertInvoice(invoice);
  res.json(invoice);
});

// ==================== SETTINGS ====================

app.get('/api/settings', (req, res) => {
  res.json(queries.getSettings());
});

app.put('/api/settings', (req, res) => {
  res.json(queries.updateSettings(req.body));
});

// ==================== EXPENSES ====================

app.get('/api/expenses', (req, res) => {
  res.json(queries.allExpenses());
});

app.post('/api/expenses', (req, res) => {
  const settings = queries.getSettings() || {};
  const expense = {
    id: req.body.id || generateId(),
    title: req.body.title,
    amount: Number(req.body.amount) || 0,
    branchId: req.body.branchId || '',
    branchName: req.body.branchId
      ? (settings.branches || []).find(b => b.id === req.body.branchId)?.name || ''
      : '',
    description: req.body.description || '',
    createdAt: new Date().toISOString()
  };
  queries.insertExpense(expense);
  res.json(expense);
});

app.delete('/api/expenses/:id', (req, res) => {
  queries.deleteExpense(req.params.id);
  res.json({ success: true });
});

app.get('/api/branches', (req, res) => {
  const settings = queries.getSettings() || {};
  const branches = (settings.branches || []).filter(b => b.isActive).map(b => ({ id: b.id, name: b.name }));
  res.json(branches);
});

// SPA fallback
app.get('{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist/freebuff-pos/browser/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🏪 Freebuff POS Server running on http://localhost:${PORT}`);
  console.log(`🗄️  SQLite database: ${DB_PATH}\n`);
});
