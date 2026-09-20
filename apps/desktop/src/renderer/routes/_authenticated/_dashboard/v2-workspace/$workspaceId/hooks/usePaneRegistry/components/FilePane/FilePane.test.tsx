import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { SharedFileDocument } from "../../../../state/fileDocumentStore";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useDelayedFileAutoSave } = await import("./FilePane");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

describe("useDelayedFileAutoSave", () => {
	test("reschedules after an in-flight save finishes with newer content", () => {
		const originalSetTimeout = window.setTimeout;
		const originalClearTimeout = window.clearTimeout;
		const timers: Array<() => void> = [];
		const delays: number[] = [];
		window.setTimeout = ((callback: TimerHandler, delay?: number) => {
			timers.push(callback as () => void);
			delays.push(delay ?? 0);
			return timers.length;
		}) as typeof window.setTimeout;
		window.clearTimeout = (() => {}) as typeof window.clearTimeout;

		try {
			const document = {
				content: { kind: "text", value: "first", revision: "revision-1" },
				dirty: true,
				pendingSave: false,
				save: () => {
					document.pendingSave = true;
					return Promise.resolve({
						status: "saved" as const,
						revision: "revision-2",
					});
				},
			} as unknown as SharedFileDocument;
			const { rerender } = renderHook(() =>
				useDelayedFileAutoSave(document, "afterDelay"),
			);

			act(() => timers.shift()?.());
			document.content = {
				kind: "text",
				value: "second",
				revision: "revision-1",
			};
			rerender();
			document.pendingSave = false;
			rerender();

			expect(timers).toHaveLength(1);
			expect(delays).toEqual([3000, 3000]);
		} finally {
			window.setTimeout = originalSetTimeout;
			window.clearTimeout = originalClearTimeout;
		}
	});
});
