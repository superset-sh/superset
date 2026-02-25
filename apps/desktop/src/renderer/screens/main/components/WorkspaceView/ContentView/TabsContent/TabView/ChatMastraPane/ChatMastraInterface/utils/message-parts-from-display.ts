import type { UIMessage } from "ai";

type CurrentMessagePart = {
	type?: string;
	text?: string;
	thinking?: string;
	id?: string;
	name?: string;
	args?: unknown;
	result?: unknown;
	isError?: boolean;
};

function toToolType(toolName: string): `tool-${string}` {
	const normalized = toolName.trim() || "unknown_tool";
	return `tool-${normalized}` as const;
}

function normalizeToolErrorText(part: CurrentMessagePart): string {
	if (typeof part.result === "string") return part.result;
	if (
		part.result &&
		typeof part.result === "object" &&
		"message" in part.result &&
		typeof (part.result as { message?: unknown }).message === "string"
	) {
		return (part.result as { message: string }).message;
	}
	return "Tool call failed";
}

export function messagePartsFromDisplay(currentMessage: {
	content: CurrentMessagePart[];
}): UIMessage["parts"] {
	const nextParts: UIMessage["parts"] = [];
	const toolIndexById = new Map<string, number>();

	for (const part of currentMessage.content) {
		const partType = part.type ?? "";

		if (partType === "text" && typeof part.text === "string") {
			nextParts.push({ type: "text", text: part.text });
			continue;
		}

		if (partType === "thinking" && typeof part.thinking === "string") {
			nextParts.push({
				type: "reasoning",
				text: part.thinking,
			} as UIMessage["parts"][number]);
			continue;
		}

		if (partType === "tool_call") {
			const toolCallId = part.id ?? crypto.randomUUID();
			const toolPart = {
				type: toToolType(part.name ?? "unknown_tool"),
				toolCallId,
				state: "input-available",
				input: part.args ?? {},
			} as UIMessage["parts"][number];
			toolIndexById.set(toolCallId, nextParts.length);
			nextParts.push(toolPart);
			continue;
		}

		if (partType === "tool_result") {
			const toolCallId = part.id ?? crypto.randomUUID();
			const isError = part.isError === true;
			const nextToolPart = {
				type: toToolType(part.name ?? "unknown_tool"),
				toolCallId,
				state: isError ? "output-error" : "output-available",
				input: {},
				output: part.result ?? {},
				...(isError ? { errorText: normalizeToolErrorText(part) } : {}),
			} as UIMessage["parts"][number];

			const existingIndex = toolIndexById.get(toolCallId);
			if (existingIndex === undefined) {
				toolIndexById.set(toolCallId, nextParts.length);
				nextParts.push(nextToolPart);
				continue;
			}

			const existingPart = nextParts[existingIndex];
			const existingRecord =
				existingPart && typeof existingPart === "object"
					? (existingPart as Record<string, unknown>)
					: {};
			nextParts[existingIndex] = {
				type: (typeof existingRecord.type === "string" &&
				existingRecord.type.startsWith("tool-")
					? existingRecord.type
					: toToolType(part.name ?? "unknown_tool")) as `tool-${string}`,
				toolCallId,
				state: isError ? "output-error" : "output-available",
				input: existingRecord.input ?? {},
				output: part.result ?? {},
				...(isError ? { errorText: normalizeToolErrorText(part) } : {}),
			} as UIMessage["parts"][number];
		}
	}

	return nextParts;
}
