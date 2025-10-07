import { api } from './axios';

export type AdminUserLite = {
  _id: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  createdAt: string;
};

export type TaskSummary = {
  _id: string;
  title: string;
  status: 'open' | 'done';
  priority?: 'low' | 'medium' | 'high';
  createdAt: string;
  dueAt?: string;
  completedAt?: string | null;
};

export type UserOverview = {
  user: { _id: string; name: string; email: string; role: string; createdAt: string };
  stats: { created: number; assignedOpen: number; assignedDone: number; closed: number };
  lists: { created: TaskSummary[]; assigned: TaskSummary[]; closed: TaskSummary[] };
  teamIds: string[]; // IDs de los equipos a los que pertenece el usuario 
};

export async function adminListUsers(q = ''): Promise<AdminUserLite[]> {
  const res = await api.get('/admin/users', { params: { q } });
  return res.data;
}

export async function adminGetUserOverview(id: string) {
  const res = await api.get(`/admin/users/${id}/overview`);
  return res.data;
}
