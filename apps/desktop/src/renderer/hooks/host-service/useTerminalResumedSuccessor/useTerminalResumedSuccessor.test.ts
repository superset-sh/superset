import { describe, expect, test } from "bun:test";
import { terminalResumedSuccessorQueryOptions } from "./useTerminalResumedSuccessor";

describe("terminalResumedSuccessorQueryOptions", () => {
	test("re-asks the host on every mount so a resume that happened while the pane was unmounted is not hidden by a cached null", async () => {
		const successor = { terminalId: "t2", label: "Claude" };
		const options = terminalResumedSuccessorQueryOptions("ws-1", "t1", () =>
			Promise.resolve(successor),
		);

		// A pane cached null, unmounted, missed the "resumed" event (its
		// lifecycle subscriptions only exist while mounted), and remounted
		// inside staleTime: only an unconditional mount refetch sees t2.
		expect(options.refetchOnMount).toBe("always");
		expect(options.queryKey).toEqual([
			"terminal-resumed-successor",
			"ws-1",
			"t1",
		]);
		expect(await options.queryFn()).toEqual(successor);
	});
});
