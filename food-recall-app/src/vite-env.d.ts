/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_OPENFDA_KEY?: string;
  readonly VITE_OPENFDA_PROXY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
