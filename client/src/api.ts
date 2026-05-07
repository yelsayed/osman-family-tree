import type { FamilyNode } from './types';

// Same-origin in production (Express serves the built SPA + /api).
// In dev, Vite proxies /api -> http://localhost:3001.
const BASE = '';

async function handle<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json && (json.error || json.message)) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return (json.data ?? json) as T;
}

export async function verifyPassword(password: string): Promise<boolean> {
  const res = await fetch(`${BASE}/api/verify-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (res.status === 401) return false;
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  return true;
}

export async function fetchNodes(): Promise<FamilyNode[]> {
  const res = await fetch(`${BASE}/api/nodes`);
  return handle<FamilyNode[]>(res);
}

export type NewNodePayload = Omit<FamilyNode, 'id'> & { password: string };
export async function createNode(payload: NewNodePayload): Promise<FamilyNode> {
  const res = await fetch(`${BASE}/api/nodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handle<FamilyNode>(res);
}

export type UpdateNodePayload = Partial<Omit<FamilyNode, 'id'>> & { password: string };
export async function updateNode(id: number, payload: UpdateNodePayload): Promise<FamilyNode> {
  const res = await fetch(`${BASE}/api/nodes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handle<FamilyNode>(res);
}

export async function deleteNode(id: number, password: string): Promise<number[]> {
  const res = await fetch(`${BASE}/api/nodes/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  return json.deleted as number[];
}
