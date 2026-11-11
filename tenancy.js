const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { queries, DATA_DIR } = require('./db');

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SECRET_PATH = path.join(DATA_DIR, '.session-secret');

const RESERVED_SLUGS = new Set([
  'api',
  'app',
  'admin',
  'login',
  'register',
  'logout',
  'www',
  'support',
  'static',
  'assets',
  'dashboard'
]);

// ==================== SESSION SECRET ====================
let cachedSecret = null;

function getSecret() {
  if (cachedSecret) return cachedSecret;

  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32) {
    cachedSecret = process.env.SESSION_SECRET;
    return cachedSecret;
  }

  try {
    if (fs.existsSync(SECRET_PATH)) {
      const stored = fs.readFileSync(SECRET_PATH, 'utf8').trim();
      if (stored.length >= 32) {
        cachedSecret = stored;
        return cachedSecret;
      }
    }
  } catch {
    /* fall through and create a new secret */
  }

  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(SECRET_PATH, secret, { mode: 0o600 });
  cachedSecret = secret;
  return secret;
}

// ==================== TOKENS ====================
// The token is the only thing the server trusts about identity. The tenant is
// read from the signed payload, never from a query string or request body.
function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const index = token.lastIndexOf('.');
  const body = token.slice(0, index);
  const signature = token.slice(index + 1);
  const expected = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.tid || !payload.uid || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function issueToken(user, tenant) {
  return signToken({
    tid: tenant.id,
    uid: user.id,
    exp: Date.now() + SESSION_TTL_MS
  });
}

// ==================== SHAPES ====================
function publicUser(user) {
  if (!user) return null;
  const { password, ...rest } = user;
  return rest;
}

function publicTenant(tenant) {
  if (!tenant) return null;
  const { id, slug, name, plan, status, createdAt } = tenant;
  return { id, slug, name, plan, status, createdAt };
}

function normalizeSlug(input) {
  return String(input || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
}

// ==================== MIDDLEWARE ====================
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ message: 'الجلسة منتهية، يرجى تسجيل الدخول من جديد' });
  }

  const tenant = queries.findTenantById(payload.tid);
  if (!tenant) {
    return res.status(401).json({ message: 'الحساب لم يعد موجوداً' });
  }
  if (tenant.status !== 'active') {
    return res.status(403).json({ message: 'هذا المتجر غير مفعّل حالياً' });
  }

  // Re-read the user on every request so deactivating an employee takes effect
  // immediately, and so an id from another tenant can never be resolved.
  const user = queries.findUserById(tenant.id, payload.uid);
  if (!user || !user.active) {
    return res.status(401).json({ message: 'المستخدم غير موجود أو موقوف' });
  }

  req.tenant = tenant;
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'هذه العملية متاحة لمدير المتجر فقط' });
  }
  next();
}

module.exports = {
  authenticate,
  requireAdmin,
  issueToken,
  verifyToken,
  publicUser,
  publicTenant,
  normalizeSlug,
  RESERVED_SLUGS,
  SESSION_TTL_MS
};
