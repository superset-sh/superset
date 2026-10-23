import { describe, expect, test } from "bun:test";
import { paneLayoutRequestSchema } from "./pane-layout-ops";

describe("paneLayoutRequestSchema", () => {
	test("keeps a close op's expectedTerminalId", () => {
		const parsed = paneLayoutRequestSchema.parse({
			workspaceId: "ws-1",
			op: {
				type: "close",
				paneId: "pane-1",
				keepTerminal: true,
				expectedTerminalId: "term-1",
			},
		});
		expect(parsed.op).toEqual({
			type: "close",
			paneId: "pane-1",
			keepTerminal: true,
			expectedTerminalId: "term-1",
		});
	});
});
