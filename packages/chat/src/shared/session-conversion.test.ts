import { describe, expect, it } from "bun:test";
import type { WholeMessageChunk } from "../session-db/types";
import {
	createDefaultSessionConverterRegistry,
	type SessionConverter,
	SessionConverterRegistry,
} from "./session-conversion";

function getText(chunk: WholeMessageChunk): string {
	const textPart = chunk.message.parts.find(
		(part): part is { type: "text"; text: string } =>
			part.type === "text" &&
			typeof (part as { text?: unknown }).text === "string",
	);
	return textPart?.text ?? "";
}

describe("session-conversion", () => {
	it("converts codex session events into whole-message chat chunks", () => {
		const registry = createDefaultSessionConverterRegistry();
		const input = [
			JSON.stringify({
				kind: "codex_event",
				dir: "to_tui",
				type: "task_started",
				turn_id: "turn-1",
				timestamp: "2026-02-25T08:00:00.000Z",
			}),
			JSON.stringify({
				kind: "codex_event",
				dir: "from_tui",
				type: "user_message",
				turn_id: "turn-1",
				timestamp: "2026-02-25T08:00:01.000Z",
				message: {
					id: "u-1",
					role: "user",
					content: [{ type: "input_text", text: "Plan a refactor" }],
				},
			}),
			JSON.stringify({
				kind: "codex_event",
				dir: "to_tui",
				type: "assistant_message",
				turn_id: "turn-1",
				timestamp: "2026-02-25T08:00:02.000Z",
				message: {
					id: "a-1",
					role: "assistant",
					content: [{ type: "output_text", text: "Here is a plan." }],
				},
			}),
			JSON.stringify({
				kind: "codex_event",
				dir: "to_tui",
				type: "agent-turn-complete",
				turn_id: "turn-1",
				timestamp: "2026-02-25T08:00:03.000Z",
			}),
		].join("\n");

		const result = registry.convert({ input });
		expect(result.providerId).toBe("codex");
		expect(result.messages).toHaveLength(2);
		expect(result.messages[0]?.message.role).toBe("user");
		expect(result.messages[1]?.message.role).toBe("assistant");
		const first = result.messages[0];
		const second = result.messages[1];
		if (!first || !second) throw new Error("Expected two converted messages");
		expect(getText(first)).toBe("Plan a refactor");
		expect(getText(second)).toBe("Here is a plan.");
	});

	it("converts claude code session entries into whole-message chat chunks", () => {
		const registry = createDefaultSessionConverterRegistry();
		const input = [
			JSON.stringify({
				type: "user",
				timestamp: "2026-02-25T09:00:00.000Z",
				message: {
					id: "u-claude-1",
					role: "user",
					content: [{ type: "text", text: "Review this patch." }],
				},
			}),
			JSON.stringify({
				type: "assistant",
				timestamp: "2026-02-25T09:00:02.000Z",
				message: {
					id: "a-claude-1",
					role: "assistant",
					content: [{ type: "text", text: "Looks good overall." }],
				},
			}),
		].join("\n");

		const result = registry.convert({ input });
		expect(result.providerId).toBe("claude-code");
		expect(result.messages).toHaveLength(2);
		expect(result.messages[0]?.message.role).toBe("user");
		expect(result.messages[1]?.message.role).toBe("assistant");
		const first = result.messages[0];
		const second = result.messages[1];
		if (!first || !second) throw new Error("Expected two converted messages");
		expect(getText(first)).toBe("Review this patch.");
		expect(getText(second)).toBe("Looks good overall.");
	});

	it("supports extensibility via custom converter registration", () => {
		const registry = new SessionConverterRegistry();
		const fixtureConverter: SessionConverter = {
			id: "fixture",
			detect(entry) {
				const record =
					typeof entry === "object" && entry !== null && !Array.isArray(entry)
						? (entry as { kind?: unknown })
						: null;
				return record?.kind === "fixture";
			},
			convert({ entry, entryIndex }) {
				const record =
					typeof entry === "object" && entry !== null && !Array.isArray(entry)
						? (entry as { text?: unknown })
						: null;
				if (!record || typeof record.text !== "string") return null;
				return {
					type: "whole-message",
					message: {
						id: `fixture-${entryIndex}`,
						role: "system",
						parts: [{ type: "text", text: record.text }],
						createdAt: "2026-02-25T10:00:00.000Z",
					},
				};
			},
		};

		registry.register(fixtureConverter);
		const result = registry.convert({
			input: [{ kind: "fixture", text: "Imported from fixture" }],
		});

		expect(result.providerId).toBe("fixture");
		expect(result.messages).toHaveLength(1);
		expect(result.messages[0]?.message.role).toBe("system");
		const first = result.messages[0];
		if (!first) throw new Error("Expected one converted message");
		expect(getText(first)).toBe("Imported from fixture");
		expect(registry.unregister("fixture")).toBe(true);
		expect(registry.unregister("fixture")).toBe(false);
	});
});
