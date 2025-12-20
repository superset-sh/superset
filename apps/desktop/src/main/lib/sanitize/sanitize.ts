/**
 * Pattern for valid binary names.
 * Allows alphanumeric characters, underscores, hyphens, and dots.
 * Examples: "node", "git", "claude-code", "python3.11"
 */
const VALID_BINARY_NAME_PATTERN = /^[A-Za-z0-9_.-]+$/;

/**
 * Validates that a binary name contains only safe characters.
 * This prevents shell injection when the name is used in shell commands.
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
	return VALID_BINARY_NAME_PATTERN.test(name);
}
