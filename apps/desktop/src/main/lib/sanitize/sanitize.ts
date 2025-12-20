import { parse } from "shell-quote";

/**
 * Characters that are dangerous in shell contexts but may not be caught by shell-quote.
 * Includes backticks (command substitution), quotes, and other shell metacharacters.
 */
const DANGEROUS_CHARS = /[`'"$!#~{}[\]()<>|&;*?\s\\]/;

/**
 * Validates that a binary name is safe to use in shell commands.
 * Uses shell-quote to detect shell metacharacters and operators,
 * plus additional checks for characters shell-quote might miss.
 *
 * @param name - The binary name to validate
 * @returns true if the name is safe to use in shell commands
 *
 * @example
 * isValidBinaryName("node") // true
 * isValidBinaryName("python3.11") // true
 * isValidBinaryName("claude-code") // true
 * isValidBinaryName("git; rm -rf /") // false
 * isValidBinaryName("$(whoami)") // false
 */
export function isValidBinaryName(name: string): boolean {
	if (!name || typeof name !== "string") {
		return false;
	}

	// Reject paths - binary names should not contain path separators
	if (name.includes("/")) {
		return false;
	}

	// Reject any dangerous shell metacharacters
	if (DANGEROUS_CHARS.test(name)) {
		return false;
	}

	// Use shell-quote to parse the name and detect shell operators
	// If parsing returns anything other than a single string matching the input,
	// it contains shell operators or was interpreted specially
	const parsed = parse(name);

	// Must parse to exactly one token that's a plain string matching input
	if (parsed.length !== 1) {
		return false;
	}

	const token = parsed[0];

	// shell-quote returns objects for operators (like { op: ';' })
	// and plain strings for safe literals
	if (typeof token !== "string") {
		return false;
	}

	// The parsed token must exactly match the input
	return token === name;
}
