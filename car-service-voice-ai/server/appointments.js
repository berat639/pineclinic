import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data/appointments.json');

async function readAll() {
  const raw = await fs.readFile(DB_PATH, 'utf-8');
  return JSON.parse(raw);
}

async function writeAll(data) {
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

export async function getAll() {
  return await readAll();
}

export async function getByPhone(phone) {
  const all = await readAll();
  return all.filter(a => a.telefon === phone);
}

export async function create(data) {
  const all = await readAll();
  const record = {
    id: Date.now().toString(),
    ...data,
    durum: 'beklemede',
    olusturulma: new Date().toISOString(),
  };
  all.push(record);
  await writeAll(all);
  return record;
}

export async function updateStatus(id, durum) {
  const all = await readAll();
  const idx = all.findIndex(a => a.id === id);
  if (idx === -1) return null;
  all[idx].durum = durum;
  await writeAll(all);
  return all[idx];
}

export async function remove(id) {
  const all = await readAll();
  const filtered = all.filter(a => a.id !== id);
  await writeAll(filtered);
}
