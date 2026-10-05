// The implementation lives in @superset/shared so a headless script (cloud
// sandbox setup, seeding a real session before the desktop ever launches) can
// produce a file this app can decrypt, without depending on apps/desktop.
export { decrypt, encrypt } from "@superset/shared/auth-token-crypto";
