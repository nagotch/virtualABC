/// <reference types="vite/client" />

interface ImportMetaEnv {
  // API のベースURL（未指定なら開発時は :3000、本番は同一オリジン）
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
