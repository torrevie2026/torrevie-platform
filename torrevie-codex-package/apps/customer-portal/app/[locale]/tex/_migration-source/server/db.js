import { neon } from '@neondatabase/serverless';

let cachedSql = null;

export function getSql() {
  if (cachedSql) return cachedSql;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not configured');
  cachedSql = neon(connectionString);
  return cachedSql;
}

export async function readJson(req) {
  if (typeof req.body === 'object' && req.body) return req.body;
  if (typeof req.body === 'string' && req.body.trim()) return JSON.parse(req.body);
  return {};
}

export function json(res, status, payload) {
  res.status(status).json(payload);
}
