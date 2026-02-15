import type { ChatMessage, MessagePart } from "../types";

/**
 * Converts raw history messages (AI SDK V5 UIMessages or Mastra DB format)
 * into our internal ChatMessage[] representation.
 */
export function hydrateMessages(
	historyMessages: Array<Record<string, unknown>>,
): ChatMessage[] {
	return (
		historyMessages as Array<{
			id: string;
			role: string;
			parts?: Array<Record<string, unknown>>;
			content?: {
				parts?: Array<Record<string, unknown>>;
				content?: unknown;
			};
		}>
	)
		.filter((msg) => msg.role === "user" || msg.role === "assistant")
		.map((msg) => {
			const parts: MessagePart[] = [];

			// Try top-level parts first (AI SDK V5 UIMessage), fall back to content.parts (Mastra DB)
			const rawParts: Array<Record<string, unknown>> =
				msg.parts ?? msg.content?.parts ?? [];

			if (rawParts.length > 0) {
				for (const part of rawParts) {
					const partType = String(part.type ?? "");
					if (
						partType === "text" &&
						typeof part.text === "string" &&
						part.text
					) {
						parts.push({ type: "text", text: part.text });
					} else if (partType.startsWith("tool-")) {
						// AI SDK V5: type is "tool-{toolName}" (e.g. "tool-agent-planner", "tool-read_file")
						//   fields: toolCallId, input (args), output (result), state
						// AI SDK V4 / Mastra DB: type is "tool-invocation", "tool-call", or "tool-result"
						//   fields: toolCallId/toolInvocationId, args, result
						const tName = String(
							part.toolName ??
								(partType !== "tool-invocation" &&
								partType !== "tool-call" &&
								partType !== "tool-result"
									? partType.replace(/^tool-/, "")
									: "unknown"),
						);
						const tCallId = String(
							part.toolCallId ?? part.toolInvocationId ?? crypto.randomUUID(),
						);
						// V5 uses "input"/"output", V4/DB uses "args"/"result"
						const toolArgs = part.input ?? part.args;
						const toolResult = part.output ?? part.result;

						if (tName.startsWith("agent-")) {
							const agentName = tName.replace(/^agent-/, "");
							const prompt =
								typeof toolArgs === "object" && toolArgs !== null
									? (((toolArgs as Record<string, unknown>).prompt as string) ??
										"")
									: "";
							const resultText =
								typeof toolResult === "object" && toolResult !== null
									? (((toolResult as Record<string, unknown>).text as string) ??
										JSON.stringify(toolResult))
									: String(toolResult ?? "");
							parts.push({
								type: "agent-call",
								toolCallId: tCallId,
								agentName,
								prompt,
								status: "done",
								parts: [],
								result: resultText,
							});
						} else {
							parts.push({
								type: "tool-call",
								toolCallId: tCallId,
								toolName: tName,
								args: toolArgs,
								status: "done",
								result: toolResult,
							});
						}
					}
					// Ignore step-start, reasoning, source, file and other V5 part types
				}
			}

			return {
				id: String(msg.id ?? crypto.randomUUID()),
				role: msg.role as "user" | "assistant",
				parts,
			};
		});
}
