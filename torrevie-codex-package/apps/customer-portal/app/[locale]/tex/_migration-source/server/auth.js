import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { getSql } from './db.js';

const COOKIE_NAME = 'tex_session';

function getJwtSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error('AUTH_SECRET must be configured');
  return new TextEncoder().encode(secret);
}

export function getCookie(req, name) {
  const cookieHeader = req.headers.cookie || '';
  for (const pair of cookieHeader.split(';')) {
    const [key, ...value] = pair.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return null;
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export async function issueSession(user) {
  return new SignJWT({
    sub: user.id,
    email: user.email,
    companyId: user.company_id,
    role: user.role,
    superAdmin: user.super_admin === true,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getJwtSecret());
}

export function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure}`);
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export async function getSessionUser(req) {
  const token = getCookie(req, COOKIE_NAME);
  if (!token) return null;
  try {
    const verified = await jwtVerify(token, getJwtSecret());
    const sql = getSql();
    const rows = await sql`
      select id, email, full_name, avatar_url, company_id, role, super_admin, manager_id, is_ceo, approval_limit_aed,
             created_at, updated_at
      from app_users
      where id = ${verified.payload.sub}
      limit 1
    `;
    return rows[0] || null;
  } catch {
    return null;
  }
}

export function serializeAuthUser(user) {
  return {
    user: {
      id: user.id,
      email: user.email,
      user_metadata: { full_name: user.full_name, company_id: user.company_id },
    },
    profile: {
      id: user.id,
      company_id: user.company_id,
      full_name: user.full_name,
      role: user.role,
      super_admin: user.super_admin,
      avatar_url: user.avatar_url || null,
      manager_id: user.manager_id || null,
      is_ceo: user.is_ceo === true,
      approval_limit_aed: user.approval_limit_aed ?? null,
    },
    session: { access_token: 'server-cookie-session' },
    memberships: user.memberships || [],
    companies: user.companies || [],
  };
}
