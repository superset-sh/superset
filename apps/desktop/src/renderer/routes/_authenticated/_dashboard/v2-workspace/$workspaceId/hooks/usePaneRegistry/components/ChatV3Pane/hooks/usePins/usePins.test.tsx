import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { ChatTransport } from "@superset/chat/client";
import type { ChatPinRow } from "@superset/chat-runtime";

// happy-dom is unnecessary here (no DOM rendering) but the desktop bunfig
// preload applies suite-wide; keep the same scaffolding as sibling tests.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();

const { act, renderHook, cleanup } = await import("@testing-library/react");
const { usePins } = await import("./usePins");

afterEach(() => {
	cleanup();
});
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

function fakeTransport(rows: ChatPinRow[] = []) {
	const calls: { name: string; input: unknown }[] = [];
	return {
		calls,
		transport: {
			listPins: async (input: unknown) => {
				calls.push({ name: "listPins", input });
				return rows;
			},
			addPin: async (input: unknown) => {
				calls.push({ name: "addPin", input });
				return null;
			},
			removePin: async (input: unknown) => {
				calls.push({ name: "removePin", input });
			},
			renamePin: async (input: unknown) => {
				calls.push({ name: "renamePin", input });
				return null;
			},
		} as unknown as ChatTransport,
	};
}

describe("usePins", () => {
	test("loads pins for the session and derives the pinned id set", async () => {
		const { transport } = fakeTransport([
			{
				sessionId: "s-1",
				itemId: "a#0",
				label: "A",
				snapshotText: "text",
				createdAt: 1,
			},
		]);
		let hook!: ReturnType<typeof usePins>;
		await act(async () => {
			renderHook(() => {
				hook = usePins(transport, "s-1");
			});
		});
		expect(hook.pins).toHaveLength(1);
		expect(hook.pinnedItemIds.has("a#0")).toBe(true);
	});

	test("addPin sends the item payload then refreshes", async () => {
		const { calls, transport } = fakeTransport();
		let hook!: ReturnType<typeof usePins>;
		await act(async () => {
			renderHook(() => {
				hook = usePins(transport, "s-1");
			});
		});
		await act(async () => {
			await hook.addPin("a#0", "Label", "snapshot");
		});
		const add = calls.filter((call) => call.name === "addPin");
		expect(add).toHaveLength(1);
		expect(add[0].input).toMatchObject({
			sessionId: "s-1",
			itemId: "a#0",
			label: "Label",
			snapshotText: "snapshot",
		});
		expect(
			calls.filter((call) => call.name === "listPins").length,
		).toBeGreaterThanOrEqual(2);
	});

	test("without a session it stays empty and never calls transport", async () => {
		const { calls, transport } = fakeTransport();
		let hook!: ReturnType<typeof usePins>;
		await act(async () => {
			renderHook(() => {
				hook = usePins(transport, null);
			});
		});
		expect(hook.pins).toHaveLength(0);
		await act(async () => {
			await hook.addPin("a#0", "Label", "snapshot");
		});
		expect(calls).toHaveLength(0);
	});

	test("a failed mutation still refreshes and rethrows for the caller to surface", async () => {
		const failure = new Error("boom");
		const { calls, transport } = fakeTransport();
		transport.addPin = async () => {
			throw failure;
		};
		let hook!: ReturnType<typeof usePins>;
		await act(async () => {
			renderHook(() => {
				hook = usePins(transport, "s-1");
			});
		});
		await act(async () => {
			await expect(hook.addPin("a#0", "Label", "snapshot")).rejects.toBe(
				failure,
			);
		});
		expect(
			calls.filter((call) => call.name === "listPins").length,
		).toBeGreaterThanOrEqual(2);
	});
});
