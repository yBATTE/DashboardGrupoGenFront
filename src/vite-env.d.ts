/// <reference types="vite/client" />

// (opcional) añade tus envs tipados:
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
