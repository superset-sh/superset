// Re-export of the real config in packages/i18n so tools that discover Lingui
// config by upward search from an app directory (the Babel macro plugin in
// electron-vite, Metro on mobile) can find it. Extract/compile run from
// packages/i18n and load that file directly, so catalog paths always resolve
// relative to packages/i18n regardless of which entry a tool discovered.
export { default } from "./packages/i18n/lingui.config";
