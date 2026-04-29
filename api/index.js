const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

// CORS for Vercel
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// PostgreSQL connection (Vercel Postgres)
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

function dbQuery(text, params) {
  return pool.query(text, params);
}

// Initialize tables on first request
let dbReady = false;
async function initDb() {
  if (dbReady) return;
  try {
    await dbQuery(`CREATE TABLE IF NOT EXISTS vehicles (
      id SERIAL PRIMARY KEY,
      license_plate VARCHAR(255) NOT NULL UNIQUE,
      vehicle_type VARCHAR(255),
      owner_name VARCHAR(255),
      roll_no VARCHAR(255),
      slot VARCHAR(255),
      entry_time BIGINT NOT NULL,
      expected_exit BIGINT,
      hourly_rate INTEGER
    )`, []);

    await dbQuery(`CREATE TABLE IF NOT EXISTS registered_vehicles (
      id SERIAL PRIMARY KEY,
      license_plate VARCHAR(255) NOT NULL UNIQUE,
      owner_name VARCHAR(255),
      vehicle_type VARCHAR(255),
      id_dept VARCHAR(255),
      status VARCHAR(255),
      registered_at BIGINT
    )`, []);

    dbReady = true;
    console.log('✅ Database tables ready.');
  } catch (err) {
    console.error('❌ DB init error:', err.message);
  }
}

// Ensure DB is ready before any request
app.use(async (req, res, next) => {
  await initDb();
  next();
});

// ─── API Routes ────────────────────────────────────────

// 1. Get all parked vehicles
app.get('/api/vehicles', async (req, res) => {
  try {
    const result = await dbQuery('SELECT * FROM vehicles ORDER BY entry_time DESC', []);
    const vehicles = result.rows.map(row => ({
      ...row,
      entry_time: Number(row.entry_time)
    }));
    res.json({ vehicles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Add a vehicle (Entry)
app.post('/api/vehicles/enter', async (req, res) => {
  const { license_plate, vehicle_type, owner_name, roll_no, slot, hourly_rate, expected_exit } = req.body;
  const entry_time = Date.now();

  if (!license_plate) {
    return res.status(400).json({ error: 'License plate is required' });
  }

  try {
    const sql = `
      INSERT INTO vehicles 
      (license_plate, vehicle_type, owner_name, roll_no, slot, entry_time, hourly_rate, expected_exit) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `;
    const result = await dbQuery(sql, [license_plate, vehicle_type, owner_name, roll_no, slot, entry_time, hourly_rate, expected_exit]);
    
    res.json({ 
      message: 'Vehicle parked successfully', 
      vehicle: { id: result.rows[0].id, license_plate, vehicle_type, owner_name, slot, entry_time }
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Vehicle is already parked!' });
    }
    res.status(500).json({ error: err.message });
  }
});

// 3. Register a vehicle
app.post('/api/vehicles/register', async (req, res) => {
  const { license_plate, owner_name, vehicle_type, id_dept, status } = req.body;
  const registered_at = Date.now();

  if (!license_plate || !owner_name) {
    return res.status(400).json({ error: 'License plate and owner name are required' });
  }

  try {
    const sql = `
      INSERT INTO registered_vehicles 
      (license_plate, owner_name, vehicle_type, id_dept, status, registered_at) 
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (license_plate) DO UPDATE SET 
        owner_name = EXCLUDED.owner_name,
        vehicle_type = EXCLUDED.vehicle_type,
        id_dept = EXCLUDED.id_dept,
        status = EXCLUDED.status
    `;
    await dbQuery(sql, [license_plate, owner_name, vehicle_type, id_dept, status, registered_at]);
    res.json({ message: 'Vehicle registered successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Get all registered vehicles
app.get('/api/vehicles/registered', async (req, res) => {
  try {
    const result = await dbQuery('SELECT * FROM registered_vehicles ORDER BY registered_at DESC', []);
    res.json({ vehicles: result.rows });
  } catch (err) {
    res.json({ vehicles: [] });
  }
});

// 5. Remove a vehicle (Exit)
app.delete('/api/vehicles/exit/:plate', async (req, res) => {
  const plate = req.params.plate.toUpperCase();

  try {
    const selectResult = await dbQuery('SELECT * FROM vehicles WHERE license_plate = $1', [plate]);
    if (selectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }

    const row = selectResult.rows[0];
    const entryTimeNum = Number(row.entry_time);
    const exit_time = Date.now();
    const durationMs = exit_time - entryTimeNum;
    const hoursParked = Math.max(1, Math.ceil(durationMs / (1000 * 60 * 60)));
    
    let fee = 0;
    if (row.hourly_rate > 0) {
      fee = hoursParked * row.hourly_rate;
    }

    await dbQuery('DELETE FROM vehicles WHERE license_plate = $1', [plate]);
    
    res.json({ 
      message: 'Vehicle checked out', 
      vehicle: row,
      fee: fee,
      hours: hoursParked,
      durationMs: durationMs
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;
