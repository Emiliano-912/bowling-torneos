require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'bowling2025';
const DATA_FILE = path.join(__dirname, 'data', 'bowling.json');
const BACKUP_DIR = path.join(__dirname, 'data', 'backups');
const AUDIT_FILE = path.join(__dirname, 'data', 'audit.log');
const MAX_BACKUPS = 10;

// ── Ensure data dir, backup dir, and file exist ──────────────────────
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR);
}
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ players: [], tournaments: [] }));
}

function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { players: [], tournaments: [] };
  }
}

function writeData(data) {
  try {
    createBackup();
    fs.writeFileSync(DATA_FILE, JSON.stringify(data));
  } catch(e) {
    console.error('Error escribiendo datos:', e.message);
    throw e;
  }
}

// ── Backup rotation ──────────────────────────────────────────────────
function createBackup() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(BACKUP_DIR, `bowling-${ts}.json`);
    fs.copyFileSync(DATA_FILE, backupFile);
    rotateBackups();
  } catch(e) {
    console.error('Error creando backup:', e.message);
  }
}

function rotateBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('bowling-') && f.endsWith('.json'))
      .sort()
      .reverse();
    if (files.length > MAX_BACKUPS) {
      files.slice(MAX_BACKUPS).forEach(f => {
        fs.unlinkSync(path.join(BACKUP_DIR, f));
      });
    }
  } catch(e) {
    console.error('Error rotando backups:', e.message);
  }
}

// ── Audit log ────────────────────────────────────────────────────────
function auditLog(action, details) {
  try {
    const ts = new Date().toISOString();
    const line = `[${ts}] ${action}: ${JSON.stringify(details)}\n`;
    fs.appendFileSync(AUDIT_FILE, line);
  } catch {}
}

// ── Password storage ─────────────────────────────────────────────────
const CONFIG_FILE = path.join(__dirname, 'data', 'config.json');

function getStoredPassword() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      return cfg.password || null;
    }
  } catch {}
  return null;
}

function verifyPassword(password) {
  if (!password) return false;
  const stored = getStoredPassword();
  if (stored) return password === stored;
  return password === ADMIN_PASSWORD;
}

// ── Data validation ──────────────────────────────────────────────────
function validateData(data) {
  if (!data || typeof data !== 'object') return 'Datos inválidos';
  if (!Array.isArray(data.players)) return 'Falta array de players';
  if (!Array.isArray(data.tournaments)) return 'Falta array de tournaments';
  for (const p of data.players) {
    if (!p.id || !p.name) return `Jugador inválido: falta id o name`;
    if (!Array.isArray(p.scores)) return `Jugador ${p.name}: scores no es array`;
  }
  for (const t of data.tournaments) {
    if (!t.id || !t.name || !t.mode) return `Torneo inválido: falta id, name o mode`;
  }
  return null;
}

// ── Middleware ────────────────────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Rate limiting ────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { ok: false, error: 'Demasiados intentos. Esperá 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { ok: false, error: 'Demasiadas solicitudes' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);

// ── API Routes ───────────────────────────────────────────────────────

app.get('/api/data', (req, res) => {
  try {
    res.json({ ok: true, data: readData() });
  } catch(e) {
    res.status(500).json({ ok: false, error: 'Error leyendo datos' });
  }
});

app.post('/api/data', (req, res) => {
  const { password, data } = req.body;
  if (!verifyPassword(password)) {
    return res.status(401).json({ ok: false, error: 'Contraseña incorrecta' });
  }
  const validationErr = validateData(data);
  if (validationErr) {
    return res.status(400).json({ ok: false, error: validationErr });
  }
  try {
    writeData(data);
    auditLog('SAVE', { players: data.players.length, tournaments: data.tournaments.length });
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ ok: false, error: 'Error guardando' });
  }
});

app.post('/api/login', loginLimiter, (req, res) => {
  const ok = verifyPassword(req.body.password);
  auditLog('LOGIN', { success: ok });
  if (ok) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false, error: 'Contraseña incorrecta' });
  }
});

app.post('/api/change-password', (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!verifyPassword(currentPassword)) {
    return res.status(401).json({ ok: false, error: 'Contraseña actual incorrecta' });
  }
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ ok: false, error: 'Mínimo 4 caracteres' });
  }
  const cfg = fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) : {};
  cfg.password = newPassword;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg));
  auditLog('CHANGE_PASSWORD', {});
  res.json({ ok: true });
});

app.get('/api/export', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=bowling-backup-${new Date().toISOString().slice(0,10)}.json`);
  res.send(fs.readFileSync(DATA_FILE, 'utf8'));
});

app.post('/api/import', (req, res) => {
  const { password, data } = req.body;
  if (!verifyPassword(password)) {
    return res.status(401).json({ ok: false, error: 'Contraseña incorrecta' });
  }
  const validationErr = validateData(data);
  if (validationErr) {
    return res.status(400).json({ ok: false, error: `Backup inválido: ${validationErr}` });
  }
  try {
    writeData(data);
    auditLog('IMPORT', { players: data.players.length, tournaments: data.tournaments.length });
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ ok: false, error: 'Error importando' });
  }
});

// ── Export CSV ────────────────────────────────────────────────────────
app.get('/api/export-csv', (req, res) => {
  try {
    const data = readData();
    const BOM = '﻿';
    let csv = BOM + 'Nombre,Categoría,Líneas,Promedio\r\n';
    data.players.forEach(p => {
      const lines = p.scores.length;
      const avg = lines ? (p.scores.reduce((a,b) => a+b, 0) / lines).toFixed(2) : '0.00';
      const name = p.name.replace(/"/g, '""');
      csv += `"${name}","${p.cat}",${lines},${avg}\r\n`;
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=jugadores-${new Date().toISOString().slice(0,10)}.csv`);
    res.send(csv);
  } catch(e) {
    res.status(500).json({ ok: false, error: 'Error exportando CSV' });
  }
});

// ── Serve app ────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🎳 Bowling Torneos corriendo en http://localhost:${PORT}`);
});
