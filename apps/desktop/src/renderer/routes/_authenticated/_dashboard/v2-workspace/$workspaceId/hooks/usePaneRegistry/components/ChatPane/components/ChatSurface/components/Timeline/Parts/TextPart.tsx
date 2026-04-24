/**
 * Assistant/user text part. Uses PacedMarkdown when active (streaming)
 * so characters reveal naturally; snaps to full text when idle.
 */

import type { TextPart } from "@superset/chat/shared";
import { PacedMarkdown } from "./Markdown";
import type { PartProps } from "./parts";

export function TextPartView({ part, active }: PartProps<TextPart>) {
	if (part.synthetic) return null;
	if (!part.text) return null;
	return <PacedMarkdown text={part.text} live={active} />;
}
