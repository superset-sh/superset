import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { createTestRuntime } from "../../testing/testRuntime";
import { createChatCallerFactory, createChatRouter } from "./router";

function newPinsCaller() {
	const runtime = createTestRuntime();
	const router = createChatRouter(runtime, {
		resolveCwd: () => "/tmp/chat-pins-cwd",
	});
	return createChatCallerFactory(router)({});
}

function addPinInput(overrides: Record<string, unknown> = {}) {
	return {
		commandId: randomUUID(),
		sessionId: "session-1",
		itemId: "msg-1#0",
		label: "Deploy checklist",
		snapshotText: "- [ ] build\n- [ ] deploy",
		...overrides,
	};
}

describe("pins", () => {
	test("addPin stores a pin and listPins returns it", async () => {
		const caller = newPinsCaller();
		const row = await caller.addPin(addPinInput());
		expect(row.sessionId).toBe("session-1");
		expect(row.itemId).toBe("msg-1#0");
		expect(row.label).toBe("Deploy checklist");
		expect(row.snapshotText).toBe("- [ ] build\n- [ ] deploy");

		const pins = await caller.listPins({ sessionId: "session-1" });
		expect(pins).toHaveLength(1);
		expect(pins[0]).toMatchObject({ itemId: "msg-1#0" });
	});

	test("addPin on the same item updates label and snapshot instead of duplicating", async () => {
		const caller = newPinsCaller();
		await caller.addPin(addPinInput());
		await caller.addPin(
			addPinInput({
				commandId: randomUUID(),
				label: "Renamed",
				snapshotText: "new text",
			}),
		);
		const pins = await caller.listPins({ sessionId: "session-1" });
		expect(pins).toHaveLength(1);
		expect(pins[0]).toMatchObject({
			label: "Renamed",
			snapshotText: "new text",
		});
	});

	test("addPin is idempotent across command retries", async () => {
		const caller = newPinsCaller();
		const commandId = randomUUID();
		await caller.addPin(addPinInput({ commandId }));
		await caller.addPin(addPinInput({ commandId }));
		const pins = await caller.listPins({ sessionId: "session-1" });
		expect(pins).toHaveLength(1);
	});

	test("renamePin updates the label and returns null for a missing pin", async () => {
		const caller = newPinsCaller();
		await caller.addPin(addPinInput());
		const renamed = await caller.renamePin({
			commandId: randomUUID(),
			sessionId: "session-1",
			itemId: "msg-1#0",
			label: "Edited label",
		});
		expect(renamed?.label).toBe("Edited label");

		const missing = await caller.renamePin({
			commandId: randomUUID(),
			sessionId: "session-1",
			itemId: "nope",
			label: "x",
		});
		expect(missing).toBeNull();
	});

	test("removePin deletes the pin", async () => {
		const caller = newPinsCaller();
		await caller.addPin(addPinInput());
		await caller.removePin({
			commandId: randomUUID(),
			sessionId: "session-1",
			itemId: "msg-1#0",
		});
		expect(await caller.listPins({ sessionId: "session-1" })).toHaveLength(0);
	});

	test("listPins is scoped to the session and ordered by creation", async () => {
		const caller = newPinsCaller();
		await caller.addPin(addPinInput({ itemId: "b" }));
		await caller.addPin(addPinInput({ itemId: "a" }));
		await caller.addPin(
			addPinInput({
				sessionId: "session-2",
				itemId: "a",
				commandId: randomUUID(),
			}),
		);
		const pins = await caller.listPins({ sessionId: "session-1" });
		expect(pins.map((pin) => pin.itemId)).toEqual(["b", "a"]);
	});

	test("rejects an empty item id", async () => {
		const caller = newPinsCaller();
		await expect(
			caller.addPin(addPinInput({ itemId: "" })).then(
				() => "resolved",
				(error: { code?: string }) => error.code,
			),
		).resolves.toBe("BAD_REQUEST");
	});
});
