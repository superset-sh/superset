const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_KEY_LENGTH = 256;
const MAX_VALUE_SIZE = 16 * 1024;
const MAX_TOTAL_SIZE = 64 * 1024;
const MAX_SECRETS_PER_PROJECT = 50;

const RESERVED_KEYS = new Set([
	"PATH",
	"HOME",
	"USER",
	"SHELL",
	"TERM",
	"PWD",
	"LANG",
	"SANDBOX_ID",
	"CONTROL_PLANE_URL",
	"SANDBOX_AUTH_TOKEN",
	"MODAL_API_SECRET",
]);

export function validateSecretKey(
	key: string,
): { valid: true } | { valid: false; error: string } {
	const normalized = key.toUpperCase();
	if (!KEY_PATTERN.test(key))
		return { valid: false, error: "Key must match [A-Za-z_][A-Za-z0-9_]*" };
	if (key.length > MAX_KEY_LENGTH)
		return {
			valid: false,
			error: `Key must be <= ${MAX_KEY_LENGTH} characters`,
		};
	if (RESERVED_KEYS.has(normalized))
		return { valid: false, error: `${normalized} is a reserved key` };
	return { valid: true };
}

export function validateSecretValue(
	value: string,
): { valid: true } | { valid: false; error: string } {
	if (Buffer.byteLength(value) > MAX_VALUE_SIZE)
		return {
			valid: false,
			error: `Value must be <= ${MAX_VALUE_SIZE / 1024}KB`,
		};
	return { valid: true };
}

export {
	KEY_PATTERN,
	MAX_KEY_LENGTH,
	MAX_VALUE_SIZE,
	MAX_TOTAL_SIZE,
	MAX_SECRETS_PER_PROJECT,
	RESERVED_KEYS,
};
