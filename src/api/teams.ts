import { api } from './axios';

export type Team = { _id: string; name: string; members: string[] };
export type TeamFull = { _id: string; name: string; members: { _id: string; name?: string; email: string, lastName: string }[] };

export async function listTeams(): Promise<Team[]> {
  const { data } = await api.get('/teams');
  return data;
}

// Admin: lista con miembros (nombre/email)
export async function listTeamsFull(): Promise<TeamFull[]> {
  const { data } = await api.get('/teams/full');
  return data;
}

export async function createTeam(payload: { name: string; members?: string[] }): Promise<Team> {
  const { data } = await api.post('/teams', payload);
  return data;
}

// Admin: renombrar
export async function renameTeam(id: string, name: string) {
  const { data } = await api.patch(`/teams/${id}`, { name });
  return data;
}

// Admin: agregar miembros
export async function addTeamMembers(id: string, memberIds: string[]) {
  const { data } = await api.post(`/teams/${id}/members`, { memberIds });
  return data;
}

// Admin: quitar un miembro
export async function removeTeamMember(id: string, userId: string) {
  const { data } = await api.delete(`/teams/${id}/members/${userId}`);
  return data;
}
