/**
 * Newly-created presets ship with `commands: [""]` so the editor has a row
 * to render; running such a preset (or a preset the user left blank)
 * reaches the launcher with `command === ""`. The host-service schema
 * requires `initialCommand` to be either absent or at least one
 * non-whitespace character — sending `""` raises a Zod "Too small" error
 * and surfaces as "Failed to run preset" in the renderer. Treat
 * empty/whitespace as "open a plain shell, no initial command".
 */
export function normalizeInitialCommand(
	command: string | undefined,
): string | undefined {
	if (command === undefined) return undefined;
	const trimmed = command.trim();
	return trimmed.length > 0 ? command : undefined;
}
