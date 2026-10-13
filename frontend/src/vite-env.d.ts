/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "server" connects to the Spring API. Anything else is rejected at build time. */
  readonly VITE_API_MODE?: "local" | "server"
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
