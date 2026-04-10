/**
 * Build-time constants baked into the CLI binary via `bun build --define`.
 * At runtime (when running `bun src/bin.ts` without compilation), falls back
 * to actual process.env so local dev can override these.
 */

export const env = {
	RELAY_URL: process.env.RELAY_URL || "https://relay.superset.sh",
	CLOUD_API_URL: process.env.CLOUD_API_URL || "https://api.superset.sh",
};
