import axios, {
  AxiosError,
  AxiosHeaders,
  InternalAxiosRequestConfig,
} from 'axios';
import { useAuthStore } from '../store/auth';

const BASE_URL =
  (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:3000/api';

export const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // por si en algún endpoint usas cookies
});

// Para marcar reintentos
declare module 'axios' {
  export interface InternalAxiosRequestConfig {
    _retry?: boolean;
  }
}

/** Único refresh en vuelo */
let refreshing: Promise<string | null> | null = null;


// === Request: agrega Authorization usando AxiosHeaders
api.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
  const at = useAuthStore.getState().accessToken;
  const h = AxiosHeaders.from(cfg.headers);
  if (at) h.set('Authorization', `Bearer ${at}`);
  // h.set('Accept', 'application/json'); // opcional
  cfg.headers = h;
  return cfg;
});


api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const status = error.response?.status;
    if (status === 401) {
      const { clear } = useAuthStore.getState();
      clear();
      if (window.location.pathname !== '/login') {
        // Redirección dura para asegurar estado limpio
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  }
);