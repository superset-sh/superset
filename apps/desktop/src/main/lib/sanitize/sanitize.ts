import { parse } from "shell-quote";

/** Shell metacharacters that shell-quote may not catch */
const DANGEROUS_CHARS = /[`'"$!#~{}[\]()<>|&;*?\s\\]/;

/**
 * Validates that a binary name is safe to use in shell commands.
 */
export function isValidBinaryName(name: string): boolean {
	if (!name || typeof name !== "string") {
		return false;
	}

	if (name.includes("/")) {
		return false;
	}

	if (DANGEROUS_CHARS.test(name)) {
		return false;
	}

	const parsed = parse(name);

	if (parsed.length !== 1) {
		return false;
	}

	const token = parsed[0];

	// shell-quote returns objects for operators (e.g. { op: ';' })
	if (typeof token !== "string") {
		return false;
	}

	return token === name;
}
