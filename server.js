const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');

// ─── Seed data ────────────────────────────────────────────────────────────────

const DEFAULT_STUDIOS = [
  {
    id: 'studio-content',
    name: 'Content Studio',
    blocks: [
      { id: 'cs-2h',  hours: 2,  price: 250  },
      { id: 'cs-4h',  hours: 4,  price: 475  },
      { id: 'cs-8h',  hours: 8,  price: 900  },
      { id: 'cs-10h', hours: 10, price: 1100 }
    ],
    createdAt: new Date().toISOString()
  },
  {
    id: 'studio-product',
    name: 'Product Studio',
    blocks: [
      { id: 'ps-2h', hours: 2, price: 145 },
      { id: 'ps-4h', hours: 4, price: 250 },
      { id: 'ps-8h', hours: 8, price: 500 }
    ],
    createdAt: new Date().toISOString()
  }
];

const DEFAULT_EXTRAS = [
  { id: 'extra-lighting',     name: 'Additional Lighting Kit', price: 200,  unit: 'item', createdAt: new Date().toISOString() },
  { id: 'extra-teleprompter', name: 'Teleprompter',            price: 50,   unit: 'item', createdAt: new Date().toISOString() },
  { id: 'extra-hmua',         name: 'Styling / HMUA',          price: 1000, unit: 'day',  createdAt: new Date().toISOString() },
  { id: 'extra-cd',           name: 'Creative Director',       price: 1000, unit: 'day',  createdAt: new Date().toISOString() }
];

// ─── Data helpers ─────────────────────────────────────────────────────────────

function initDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(DATA_FILE)) {
    // Fresh install — seed everything
    const seed = {
      deliverables: [],
      studios:  DEFAULT_STUDIOS,
      extras:   DEFAULT_EXTRAS,
      quotes:   [],
      settings: { defaultShootRate: 150, defaultEditRate: 100, defaultProfitMargin: 20, currency: 'AUD' }
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2));
    console.log('✅ Created data/data.json with default studios & extras');
  } else {
    // Migrate existing data — add studios/extras if missing
    const data = readData();
    let dirty = false;
    if (!data.studios) { data.studios = DEFAULT_STUDIOS; dirty = true; }
    if (!data.extras)  { data.extras  = DEFAULT_EXTRAS;  dirty = true; }
    if (dirty) { writeData(data); console.log('✅ Migrated data.json — added studios & extras'); }
  }
}

function readData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function newId() {
  return crypto.randomUUID();
}

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(express.json());

// ─── Password Protection ──────────────────────────────────────────────────────

const APP_PASSWORD = process.env.APP_PASSWORD || 'changeme';

app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="G Studios Rates Calculator"');
    return res.status(401).send('Authentication required');
  }
  const password = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8').split(':')[1];
  if (password !== APP_PASSWORD) {
    res.setHeader('WWW-Authenticate', 'Basic realm="G Studios Rates Calculator"');
    return res.status(401).send('Invalid password');
  }
  next();
});


app.use(express.static(path.join(__dirname, 'public')));

// ─── Deliverables ─────────────────────────────────────────────────────────────

app.get('/api/deliverables', (req, res) => {
  const data = readData();
  res.json(data.deliverables);
});

app.post('/api/deliverables', (req, res) => {
  const { name, minShootHours, minEditHours, notes } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Deliverable name is required.' });
  const data = readData();
  const item = {
    id: newId(),
    name: name.trim(),
    minShootHours: Math.max(0, parseFloat(minShootHours) || 0),
    minEditHours:  Math.max(0, parseFloat(minEditHours)  || 0),
    notes: (notes || '').trim(),
    createdAt: new Date().toISOString()
  };
  data.deliverables.push(item);
  writeData(data);
  res.status(201).json(item);
});

app.put('/api/deliverables/:id', (req, res) => {
  const data = readData();
  const idx = data.deliverables.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Deliverable not found.' });
  const { name, minShootHours, minEditHours, notes } = req.body;
  const orig = data.deliverables[idx];
  data.deliverables[idx] = {
    ...orig,
    name: name ? name.trim() : orig.name,
    minShootHours: minShootHours !== undefined ? Math.max(0, parseFloat(minShootHours) || 0) : orig.minShootHours,
    minEditHours:  minEditHours  !== undefined ? Math.max(0, parseFloat(minEditHours)  || 0) : orig.minEditHours,
    notes: notes !== undefined ? notes.trim() : orig.notes,
    updatedAt: new Date().toISOString()
  };
  writeData(data);
  res.json(data.deliverables[idx]);
});

app.delete('/api/deliverables/:id', (req, res) => {
  const data = readData();
  const idx = data.deliverables.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Deliverable not found.' });
  data.deliverables.splice(idx, 1);
  writeData(data);
  res.json({ ok: true });
});

// ─── Studios ──────────────────────────────────────────────────────────────────

app.get('/api/studios', (req, res) => {
  const data = readData();
  res.json(data.studios || []);
});

app.post('/api/studios', (req, res) => {
  const { name, blocks } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Studio name is required.' });
  const data = readData();
  const studio = {
    id: newId(),
    name: name.trim(),
    blocks: (blocks || []).map(b => ({
      id:    b.id || newId(),
      hours: Math.max(0, parseFloat(b.hours) || 0),
      price: Math.max(0, parseFloat(b.price) || 0)
    })),
    createdAt: new Date().toISOString()
  };
  data.studios.push(studio);
  writeData(data);
  res.status(201).json(studio);
});

app.put('/api/studios/:id', (req, res) => {
  const data = readData();
  const idx = data.studios.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Studio not found.' });
  const { name, blocks } = req.body;
  const orig = data.studios[idx];
  data.studios[idx] = {
    ...orig,
    name:   name ? name.trim() : orig.name,
    blocks: blocks ? blocks.map(b => ({
      id:    b.id || newId(),
      hours: Math.max(0, parseFloat(b.hours) || 0),
      price: Math.max(0, parseFloat(b.price) || 0)
    })) : orig.blocks,
    updatedAt: new Date().toISOString()
  };
  writeData(data);
  res.json(data.studios[idx]);
});

app.delete('/api/studios/:id', (req, res) => {
  const data = readData();
  const idx = data.studios.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Studio not found.' });
  data.studios.splice(idx, 1);
  writeData(data);
  res.json({ ok: true });
});

// ─── Extras ───────────────────────────────────────────────────────────────────

app.get('/api/extras', (req, res) => {
  const data = readData();
  res.json(data.extras || []);
});

app.post('/api/extras', (req, res) => {
  const { name, price, unit } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Extra name is required.' });
  const data = readData();
  const extra = {
    id:    newId(),
    name:  name.trim(),
    price: Math.max(0, parseFloat(price) || 0),
    unit:  unit || 'item',
    createdAt: new Date().toISOString()
  };
  data.extras.push(extra);
  writeData(data);
  res.status(201).json(extra);
});

app.put('/api/extras/:id', (req, res) => {
  const data = readData();
  const idx = data.extras.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Extra not found.' });
  const { name, price, unit } = req.body;
  const orig = data.extras[idx];
  data.extras[idx] = {
    ...orig,
    name:  name  ? name.trim() : orig.name,
    price: price !== undefined ? Math.max(0, parseFloat(price) || 0) : orig.price,
    unit:  unit  || orig.unit,
    updatedAt: new Date().toISOString()
  };
  writeData(data);
  res.json(data.extras[idx]);
});

app.delete('/api/extras/:id', (req, res) => {
  const data = readData();
  const idx = data.extras.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Extra not found.' });
  data.extras.splice(idx, 1);
  writeData(data);
  res.json({ ok: true });
});

// ─── Quotes ───────────────────────────────────────────────────────────────────

app.get('/api/quotes', (req, res) => {
  const data = readData();
  res.json(data.quotes);
});

app.post('/api/quotes', (req, res) => {
  const {
    jobTitle, clientName, description,
    items, studioItems, extraItems,
    shootRate, editRate, profitMargin, currency,
    totalShootHours, totalEditHours, totalHours,
    shootCost, editCost, studioCost, extrasCost,
    baseCost, profitAmount, finalPrice
  } = req.body;

  const data = readData();
  const quote = {
    id: newId(),
    jobTitle:    (jobTitle    || 'Untitled Quote').trim(),
    clientName:  (clientName  || '').trim(),
    description: (description || '').trim(),
    items:       items       || [],
    studioItems: studioItems || [],
    extraItems:  extraItems  || [],
    shootRate:   parseFloat(shootRate)   || 0,
    editRate:    parseFloat(editRate)    || 0,
    profitMargin: parseFloat(profitMargin) || 0,
    currency:    currency || 'AUD',
    totalShootHours: parseFloat(totalShootHours) || 0,
    totalEditHours:  parseFloat(totalEditHours)  || 0,
    totalHours:      parseFloat(totalHours)      || 0,
    shootCost:   parseFloat(shootCost)   || 0,
    editCost:    parseFloat(editCost)    || 0,
    studioCost:  parseFloat(studioCost)  || 0,
    extrasCost:  parseFloat(extrasCost)  || 0,
    baseCost:    parseFloat(baseCost)    || 0,
    profitAmount: parseFloat(profitAmount) || 0,
    finalPrice:  parseFloat(finalPrice)  || 0,
    createdAt: new Date().toISOString()
  };

  data.quotes.unshift(quote);
  writeData(data);
  res.status(201).json(quote);
});

app.delete('/api/quotes/:id', (req, res) => {
  const data = readData();
  const idx = data.quotes.findIndex(q => q.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Quote not found.' });
  data.quotes.splice(idx, 1);
  writeData(data);
  res.json({ ok: true });
});

// ─── Settings ─────────────────────────────────────────────────────────────────

app.get('/api/settings', (req, res) => {
  const data = readData();
  res.json(data.settings || {});
});

app.put('/api/settings', (req, res) => {
  const data = readData();
  data.settings = { ...(data.settings || {}), ...req.body };
  writeData(data);
  res.json(data.settings);
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

initDataFile();
app.listen(PORT, () => {
  console.log(`\n🎬  Rates Calculator is running!`);
  console.log(`    → http://localhost:${PORT}\n`);
});
