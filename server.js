require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'bowling2025';
const DATA_FILE = path.join(__dirname, 'data', 'bowling.json');

// ── Ensure data dir and file exist ────────────────────────────────────
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
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
    fs.writeFileSync(DATA_FILE, JSON.stringify(data));
  } catch(e) {
    console.error('Error escribiendo datos:', e.message);
    throw e;
  }
}

// ── Password storage ──────────────────────────────────────────────────
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

// ── Middleware ─────────────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ────────────────────────────────────────────────────────

// GET /api/data — Public: anyone can read
app.get('/api/data', (req, res) => {
  try {
    res.json({ ok: true, data: readData() });
  } catch(e) {
    res.status(500).json({ ok: false, error: 'Error leyendo datos' });
  }
});

// POST /api/data — Admin only: save state
app.post('/api/data', (req, res) => {
  const { password, data } = req.body;
  if (!verifyPassword(password)) {
    return res.status(401).json({ ok: false, error: 'Contraseña incorrecta' });
  }
  try {
    writeData(data);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ ok: false, error: 'Error guardando' });
  }
});

// POST /api/login — Verify admin password
app.post('/api/login', (req, res) => {
  if (verifyPassword(req.body.password)) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false, error: 'Contraseña incorrecta' });
  }
});

// POST /api/change-password — Change admin password
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
  res.json({ ok: true });
});

// GET /api/export — Download backup
app.get('/api/export', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=bowling-backup-${new Date().toISOString().slice(0,10)}.json`);
  res.send(fs.readFileSync(DATA_FILE, 'utf8'));
});

// POST /api/import — Restore backup (admin only)
app.post('/api/import', (req, res) => {
  const { password, data } = req.body;
  if (!verifyPassword(password)) {
    return res.status(401).json({ ok: false, error: 'Contraseña incorrecta' });
  }
  if (!data || !Array.isArray(data.players) || !Array.isArray(data.tournaments)) {
    return res.status(400).json({ ok: false, error: 'Backup inválido: faltan players o tournaments' });
  }
  try {
    writeData(data);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ ok: false, error: 'Error importando' });
  }
});

// ── Serve app ─────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🎳 Bowling Torneos corriendo en http://localhost:${PORT}`);
});
