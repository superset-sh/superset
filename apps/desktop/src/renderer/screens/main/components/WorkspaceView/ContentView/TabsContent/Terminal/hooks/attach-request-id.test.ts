import { describe, expect, it } from "bun:test";
import { createAttachRequestId } from "./attach-request-id";

describe("createAttachRequestId", () => {
	it("stays unique for repeated attaches on the same pane", () => {
		const first = createAttachRequestId("pane-1");
		const second = createAttachRequestId("pane-1");

		expect(first).not.toBe(second);
		expect(first.startsWith("pane-1:")).toBe(true);
		expect(second.startsWith("pane-1:")).toBe(true);
	});

	it("does not reuse IDs across panes", () => {
		const first = createAttachRequestId("pane-a");
		const second = createAttachRequestId("pane-b");

		expect(first).not.toBe(second);
	});
});
