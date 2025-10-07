import { api } from './axios';

export type Role = 'admin' | 'member';

export type BasicUser = {
  _id: string;
  name?: string;
  lastName?: string;      // 👈
  email?: string;
  displayName?: string;   // si lo mandás desde el server
};


export async function searchUsers(query: string): Promise<BasicUser[]> {
  const { data } = await api.get('/users', { params: { query } });
  return data;
}

// ⬇️ name ahora es opcional para alinear con el backend
export async function createUser(payload: { name?: string; email: string; role?: Role }) {
  const { data } = await api.post('/users', payload);
  return data;
}

export async function changeMyPassword(payload: { current: string; next: string }) {
  const { data } = await api.post('/users/me/password', payload);
  return data;
}

export async function getMe() {
  const { data } = await api.get('users/me');
  return data as { _id: string; name?: string; lastName?: string; email: string; roles?: string[] };
}

export async function updateMe(payload: { name?: string; email?: string }) {
  const { data } = await api.patch('/users/me', payload);
  return data;
}

export async function getUserById(id: string) {
  const { data } = await api.get(`/users/${id}`);
  return data as BasicUser;
}

export const forgotPassword = async (email: string) => {
  const { data } = await api.post('/users/forgot/password', { email });
  return data as { ok: boolean; message?: string };
}

