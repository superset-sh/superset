import { describe, expect, test } from "bun:test";
import type { AdapterEvent } from "../../../types";
import type { CodexTransportHandlers } from "../../rpcClient";
import { CodexAdapter } from "../codexAdapter";
import {
	MIN_CODEX_VERSION,
	meetsMinimumVersion,
	parseCodexVersion,
} from "./codexVersion";

const REAL_USER_AGENT =
	"superset-chat-runtime/0.143.0 (Mac OS 26.5.0; arm64) kitty/0.42.0 (superset-chat-runtime; 0.0.1)";

describe("codex version gate", () => {
	test("reads the codex version out of the app-server user agent", () => {
		expect(parseCodexVersion(REAL_USER_AGENT)).toBe("0.143.0");
		expect(parseCodexVersion("nonsense")).toBeNull();
	});

	test("compares versions numerically, not lexically", () => {
		expect(meetsMinimumVersion("0.143.0", "0.143.0")).toBe(true);
		expect(meetsMinimumVersion("0.144.1", "0.143.0")).toBe(true);
		expect(meetsMinimumVersion("1.0.0", "0.143.0")).toBe(true);
		expect(meetsMinimumVersion("0.99.0", "0.143.0")).toBe(false);
		expect(meetsMinimumVersion("0.142.9", "0.143.0")).toBe(false);
		expect(meetsMinimumVersion(null, "0.143.0")).toBe(false);
	});

	test("an unsupported app-server ends the session instead of streaming", async () => {
		let handlers: CodexTransportHandlers | null = null;
		const adapter = new CodexAdapter({
			createTransport: (_options, transportHandlers) => {
				handlers = transportHandlers;
				return {
					send: (line) => {
						const frame = JSON.parse(line) as { id?: number; method?: string };
						if (frame.method !== "initialize") return;
						handlers?.onLine(
							JSON.stringify({
								id: frame.id,
								result: { userAgent: "superset-chat-runtime/0.100.0 (Linux)" },
							}),
						);
					},
					close: async () => {},
				};
			},
		});

		const events: AdapterEvent[] = [];
		for await (const event of adapter.start({ cwd: "/tmp" })) {
			events.push(event);
		}

		expect(events.at(-1)).toEqual({
			kind: "session",
			session: { status: "dead" },
		});
		const notice = events.find(
			(event) => event.kind === "item" && event.item.kind === "notice",
		);
		expect(notice).toMatchObject({
			kind: "item",
			item: {
				kind: "notice",
				noticeKind: "error",
				text: `codex 0.100.0 is not supported: upgrade to ${MIN_CODEX_VERSION} or newer`,
			},
		});
	});
});
