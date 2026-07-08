import type { AgentTarget } from "./hooks/useDiffCommentTarget";

export interface DiffCommentSubmission {
	comment: string;
	target: AgentTarget;
}

/**
 * Prepare composed rich-input text for submission from the diff-comment
 * composer to an agent session.
 *
 * The rich editor (TiptapPromptEditor) serializes @file mentions and /slash
 * command chips back into their plain-text form, so `text` is already the
 * exact prompt string the composer used to read from its plain <textarea>.
 * This keeps the send payload identical to the pre-rich-input behavior:
 * `comment.trim()` plus the resolved agent target.
 *
 * Returns null when there is nothing to send (empty/whitespace-only text) or
 * no agent target is resolved yet, so a blank composer never fires a submit.
 */
export function prepareDiffCommentSubmission({
	text,
	target,
}: {
	text: string;
	target: AgentTarget | null;
}): DiffCommentSubmission | null {
	const comment = text.trim();
	if (comment.length === 0) return null;
	if (target == null) return null;
	return { comment, target };
}
