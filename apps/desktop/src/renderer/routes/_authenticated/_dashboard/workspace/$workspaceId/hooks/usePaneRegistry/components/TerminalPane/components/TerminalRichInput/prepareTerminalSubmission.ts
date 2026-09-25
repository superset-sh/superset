import { sanitizePromptForPty } from "@superset/shared/agent-prompt-launch";
import { shellEscapePaths } from "../../utils";

/**
 * Prepare composed rich-input text for submission into a terminal PTY.
 *
 * Runs the same PTY sanitization used by the diff-comment composer (strips
 * escape/OSC/control sequences, expands tabs, keeps newlines) and gates on
 * emptiness so a blank composer never fires a bare submit.
 *
 * Attachments reach the agent as worktree-relative paths appended to the
 * prompt: a PTY only takes bytes, so a path is the only way to hand a pasted
 * screenshot to whatever is running in the terminal. Attachments alone, with
 * no typed text, are still a valid submission.
 *
 * Returns the text to send, or null when there is nothing to send.
 */
export function prepareTerminalSubmission(
	raw: string,
	attachmentPaths: readonly string[] = [],
): string | null {
	const sanitized = sanitizePromptForPty(raw);
	const hasText = sanitized.trim().length > 0;
	if (!hasText && attachmentPaths.length === 0) return null;
	if (attachmentPaths.length === 0) return sanitized;

	const paths = shellEscapePaths([...attachmentPaths]);
	return hasText ? `${sanitized} ${paths}` : paths;
}
