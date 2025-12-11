// apps/web/src/api/notifications.ts
import { api } from "./axios";

export type NotificationType = "TASK_ASSIGNED" | "PAYMENT_ASSIGNED";

export type Notification = {
  _id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  data?: any;               // { taskId? , paymentId? , ... }
  seenAt?: string | null;
  createdAt?: string;
  expiresAt?: string;
};

export async function unreadCount(): Promise<number> {
  const { data } = await api.get("/notifications/unread-count");
  return Number(data?.count ?? 0);
}

export async function listNotifications(params?: {
  onlyNew?: boolean;
  includeExpired?: boolean;
}): Promise<Notification[]> {
  const { onlyNew = false, includeExpired = false } = params || {};
  const { data } = await api.get("/notifications", {
    params: {
      onlyNew: onlyNew ? "1" : "0",
      includeExpired: includeExpired ? "1" : "0",
    },
  });
  // El backend devuelve un array plano; igual soportamos {items: []} por las dudas
  if (Array.isArray(data)) return data as Notification[];
  if (data?.items && Array.isArray(data.items)) return data.items as Notification[];
  return [];
}

export async function markSeen(id: string): Promise<void> {
  await api.patch(`/notifications/${id}/seen`);
}

export async function markAllSeen(): Promise<void> {
  await api.post("/notifications/mark-all-seen");
}
