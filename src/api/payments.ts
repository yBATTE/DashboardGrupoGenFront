import { api } from './axios';

export type MiniUser = {
  _id: string;
  name?: string;
  email?: string;
};

export type Payment = {
  _id: string;
  title: string;
  amount: number;
  status: 'pending' | 'paid';
  dueAt?: string | null;
  createdAt?: string | null;
  createdBy?: string | { _id?: string; name?: string; lastName: string; email?: string } | null;
  paidAt?: string | null;
  paidBy?: string | { _id?: string; name?: string; lastName: string; email?: string } | null;
  description?: string; // antes "notes"

  // 👇 usados por los filtros
  assigneeIds?: Array<string | { _id: string; name?: string; lastName: string; email?: string }>;
  teamIds?: Array<string | { _id: string; name: string }>;
};


export async function listPayments(params?: { from?: string; to?: string }): Promise<Payment[]> {
  const { data } = await api.get('/payments', { params });
  return data;
}

export async function createPayment(payload: {
  title: string;
  description?: string;
  amount: number;
  dueAt: string;
  teamIds?: string[];
  assigneeIds?: string[];
}) {
  const { data } = await api.post('/payments', payload);
  return data;
}

export async function reopenPayment(id: string): Promise<Payment> {
  const { data } = await api.patch(`/payments/${id}/reopen`);
  return data;
}

export async function getPayment(id: string): Promise<Payment> {
  const { data } = await api.get(`/payments/${id}`);
  return data as Payment;
}

export async function markPaymentPaid(id: string): Promise<Payment> {
  const { data } = await api.patch(`/payments/${id}/paid`);
  return data;
}

export async function listPaymentsRange(params: { from?: string; to?: string }) {
  const { data } = await api.get('/payments', { params });
  return data as Payment[];
}