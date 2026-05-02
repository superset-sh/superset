// Populate the env vars `src/env.ts` validates at module load so test runtimes
// that boot host-service via `createApp` (instead of `serve.ts`) can import
// modules that transitively load the validated env. Real values come from
// each test's `createTestHost` config; these defaults exist purely to satisfy
// schema validation at import time.

process.env.ORGANIZATION_ID ??= "00000000-0000-4000-8000-000000000000";
process.env.HOST_DB_PATH ??= "/tmp/host-service-test.db";
process.env.HOST_MIGRATIONS_FOLDER ??= "/tmp/host-service-test-migrations";
process.env.AUTH_TOKEN ??= "test-auth-token";
process.env.SUPERSET_API_URL ??= "http://localhost:0";
