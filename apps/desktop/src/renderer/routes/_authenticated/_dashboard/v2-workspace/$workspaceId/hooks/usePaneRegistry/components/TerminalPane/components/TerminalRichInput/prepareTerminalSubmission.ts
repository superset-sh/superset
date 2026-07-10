import { sanitizePromptForPty } from "@superset/shared/agent-prompt-launch";

/**
 * Prepare composed rich-input text for submission into a terminal PTY.
 *
 * Runs the same PTY sanitization used by the diff-comment composer (strips
 * escape/OSC/control sequences, expands tabs, keeps newlines) and gates on
 * emptiness so a blank or whitespace-only composer never fires a bare submit.
 * Returns the sanitized prompt, or null when there is nothing to send.
 */
export function prepareTerminalSubmission(raw: string): string | null {
	const sanitized = sanitizePromptForPty(raw);
	if (sanitized.trim().length === 0) return null;
	return sanitized;
}
