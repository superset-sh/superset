import { parseEnvContent } from "@superset/shared/env-file";

export { type EnvEntry, parseEnvContent } from "@superset/shared/env-file";

const INVALID = {
	ok: false as const,
	error: "Please upload a valid .env file.",
};

export function validateEnvContent(
	text: string,
): { ok: true } | { ok: false; error: string } {
	if (text.includes("\0")) return INVALID;
	return parseEnvContent(text).length > 0 ? { ok: true } : INVALID;
}
