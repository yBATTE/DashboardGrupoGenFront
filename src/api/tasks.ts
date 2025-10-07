import { api } from './axios';

export type TaskFull = {
  _id: string;
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  status?: 'open' | 'done';
  dueAt?: string | null;

  createdAt?: string;
  updatedAt?: string;

  ownerId?: { _id: string; name?: string; email: string } | string;
  completedAt?: string | null;
  completedBy?: { _id: string; name?: string; email: string } | string | null;

  assigneeIds?: ({ _id: string; name?: string; email: string } | string)[];
  teamIds?: ({ _id: string; name: string } | string)[];
};

export const listTasks = () =>
  api.get('/tasks').then(r => r.data as TaskFull[]);  

export const getTask = (id: string) =>
  api.get(`/tasks/${id}`).then(r => r.data as TaskFull);

export const completeTask = (id: string) =>
  api.patch(`/tasks/${id}/complete`).then(r => r.data);

export const reopenTask = (id: string) =>
  api.patch(`/tasks/${id}/reopen`).then(r => r.data);
