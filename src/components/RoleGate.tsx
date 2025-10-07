import { PropsWithChildren } from 'react';
import { useAuthStore } from '../store/auth';

export function RoleGate({ anyOf, children }: PropsWithChildren<{ anyOf: string[] }>) {
  const roles = useAuthStore(s => s.roles);
  const allowed = roles.some(r => anyOf.includes(r));
  return allowed ? <>{children}</> : null;
}
