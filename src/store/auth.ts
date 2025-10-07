import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isExpired, parseJwtExp } from '../utils/jwt';

type Role = 'admin' | 'member';

type AuthState = {
  accessToken: string | null;
  roles: Role[];
  tokenExpMs: number | null;    // ← guardamos exp (ms)
  setAuth: (token: string, roles: Role[]) => void;
  clear: () => void;

  // Helpers
  isLoggedIn: () => boolean;
  isAdmin: () => boolean;
  isMember: () => boolean;
  isExpired: () => boolean;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      roles: [],
      tokenExpMs: null,

      setAuth: (token, roles) =>
        set({
          accessToken: token,
          roles,
          tokenExpMs: parseJwtExp(token),
        }),

      clear: () =>
        set({
          accessToken: null,
          roles: [],
          tokenExpMs: null,
        }),

      isLoggedIn: () => {
        const s = get();
        return !!s.accessToken && !isExpired(s.tokenExpMs);
      },
      isAdmin: () => get().roles.includes('admin'),
      isMember: () => get().roles.includes('member'),
      isExpired: () => isExpired(get().tokenExpMs),
    }),
    { name: 'auth' },
  ),
);
