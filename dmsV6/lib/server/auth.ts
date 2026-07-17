import { createHash, randomBytes } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { getSessionFromRequest, type SessionUser } from '../session';
import { query } from './db';

export interface AuthenticatedSession {
  token: string;
  user: SessionUser;
}

interface LoginRow {
  emp_id: string;
  emp_pw: string;
  emp_name: string;
  dept_id: string | null;
  dept_name: string | null;
  emp_position: string | null;
  is_admin: boolean;
}

export const md5Hex = (value: string) => createHash('md5').update(value).digest('hex');

export const createSessionToken = () => randomBytes(32).toString('base64url');

export const getRequestSession = (request: NextRequest): AuthenticatedSession | null => {
  const session = getSessionFromRequest(request);

  if (!session) {
    return null;
  }

  return {
    token: session.token,
    user: session.user
  };
};

export const requireSession = (request: NextRequest) => {
  const session = getRequestSession(request);

  if (!session) {
    throw new Error('尚未登入或登入狀態已失效。');
  }

  return session;
};

export const loginUser = async (uid: string, pwd: string) => {
  const normalizedUid = String(uid || '').trim().toUpperCase();
  const password = String(pwd || '');

  if (!normalizedUid || !password) {
    throw new Error('請輸入帳號與密碼。');
  }

  const result = await query<LoginRow>(
    `SELECT e.emp_id,
            e.emp_pw,
            e.emp_name,
            e.dept_id::text AS dept_id,
            d.dept_name,
            e.emp_position,
            EXISTS (
              SELECT 1
                FROM dms_admins a
               WHERE a.emp_id = e.emp_id
                 AND a.da_dc = 'N'
            ) AS is_admin
       FROM employee e
       LEFT JOIN department d ON d.dept_id = e.dept_id
      WHERE e.emp_id = $1
        AND e.emp_incumbent = 0
      LIMIT 1`,
    [normalizedUid]
  );
  const row = result.rows[0];

  if (!row || row.emp_pw.toLowerCase() !== md5Hex(password).toLowerCase()) {
    throw new Error('帳號或密碼錯誤。');
  }

  return {
    id: row.emp_id,
    name: row.emp_name,
    role: row.is_admin ? 'ADMIN' : 'USER',
    dept_id: row.dept_id || '',
    dept_name: row.dept_name || '',
    position: row.emp_position || ''
  };
};

export const isAdmin = (user: SessionUser) => user.role === 'ADMIN';

export const requireAdmin = (user: SessionUser) => {
  if (!isAdmin(user)) {
    throw new Error('只有系統管理員可以使用此功能。');
  }

  return user;
};
