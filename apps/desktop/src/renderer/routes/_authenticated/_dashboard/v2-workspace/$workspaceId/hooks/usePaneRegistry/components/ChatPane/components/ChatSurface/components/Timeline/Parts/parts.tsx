/**
 * Part renderer registry.
 *
 * Tool parts route through `ToolPart/toolRegistry` (case-insensitive
 * tool-name → component). Other part types go to their co-located
 * renderer. Adding a new part type = one entry here + one component.
 */

import type { Message, Part } from "@superset/chat/shared";
import type { ReactNode } from "react";
import { AgentPartView } from "./AgentPart";
import { FilePartView } from "./FilePart";
import { ImagePartView } from "./ImagePart";
import { ReasoningPartView } from "./ReasoningPart";
import { TextPartView } from "./TextPart";
import { getToolRenderer } from "./ToolPart";

export interface PartProps<P extends Part> {
	part: P;
	message: Message;
	active: boolean;
}

type PartRenderer = (args: {
	part: Part;
	message: Message;
	active: boolean;
}) => ReactNode;

const REGISTRY: { [K in Part["type"]]: PartRenderer } = {
	text: ({ part, message, active }) =>
		part.type === "text" ? (
			<TextPartView part={part} message={message} active={active} />
		) : null,
	reasoning: ({ part, message, active }) =>
		part.type === "reasoning" ? (
			<ReasoningPartView part={part} message={message} active={active} />
		) : null,
	tool: ({ part }) => {
		if (part.type !== "tool") return null;
		const Renderer = getToolRenderer(part.tool);
		return <Renderer part={part} />;
	},
	file: ({ part, message, active }) =>
		part.type === "file" ? (
			<FilePartView part={part} message={message} active={active} />
		) : null,
	image: ({ part, message, active }) =>
		part.type === "image" ? (
			<ImagePartView part={part} message={message} active={active} />
		) : null,
	agent: ({ part, message, active }) =>
		part.type === "agent" ? (
			<AgentPartView part={part} message={message} active={active} />
		) : null,
	compaction: ({ part }) =>
		part.type === "compaction" ? (
			<div className="text-muted-foreground my-2 text-center text-xs italic">
				— context compacted: {part.summary} —
			</div>
		) : null,
};

export function renderPart(
	part: Part,
	message: Message,
	active: boolean,
): ReactNode {
	const fn = REGISTRY[part.type];
	return fn({ part, message, active });
}
