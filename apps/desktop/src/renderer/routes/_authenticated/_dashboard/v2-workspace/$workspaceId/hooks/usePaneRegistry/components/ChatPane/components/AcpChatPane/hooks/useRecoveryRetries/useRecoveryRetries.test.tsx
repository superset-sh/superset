import { afterEach, expect, mock, test } from "bun:test";
import { useCallback, useRef, useState } from "react";
import { useRecoveryRetries } from "./useRecoveryRetries";

const { act, cleanup, renderHook } = await import("@testing-library/react");
afterEach(cleanup);

function scheduler() {
	const pending = new Map<() => void, number>();
	return {
		pending,
		schedule: (run: () => void, delayMs: number) => {
			pending.set(run, delayMs);
			return () => pending.delete(run);
		},
		async next() {
			const [next] = pending.keys();
			if (!next) throw new Error("No recovery attempt is scheduled");
			pending.delete(next);
			await act(async () => next());
		},
	};
}

function useFixture(
	run: () => Promise<void>,
	schedule: ReturnType<typeof scheduler>["schedule"],
	enabled: boolean,
) {
	const attempts = useRef(0);
	const inFlight = useRef(false);
	const [failure, setFailure] = useState<string | null>(null);
	const [completion, setCompletion] = useState(0);
	const recover = useCallback(() => {
		if (inFlight.current) return;
		inFlight.current = true;
		void run()
			.catch((error: unknown) => {
				setFailure(error instanceof Error ? error.message : String(error));
			})
			.finally(() => {
				inFlight.current = false;
				setCompletion((count) => count + 1);
			});
	}, [run]);
	const recovering = useRecoveryRetries({
		recoverable: enabled,
		replacementPending: false,
		attempts,
		inFlight,
		completion,
		failure,
		recover,
		limit: 3,
		schedule,
	});
	return { recovering, failure, completion, attempts: attempts.current };
}

test("three identical recovery failures exhaust the budget and reveal recovery actions", async () => {
	const timers = scheduler();
	const recover = mock(async () => {
		throw new Error("Review the unsent queue before resuming");
	});
	const view = renderHook(() => useFixture(recover, timers.schedule, true));
	expect([...timers.pending.values()]).toEqual([0]);
	await timers.next();
	expect(view.result.current.failure).toBe(
		"Review the unsent queue before resuming",
	);
	expect([...timers.pending.values()]).toEqual([1_000]);
	await timers.next();
	expect([...timers.pending.values()]).toEqual([2_000]);
	await timers.next();
	expect(recover).toHaveBeenCalledTimes(3);
	expect(view.result.current).toEqual({
		recovering: false,
		failure: "Review the unsent queue before resuming",
		completion: 3,
		attempts: 3,
	});
	expect(timers.pending.size).toBe(0);
});

test("an unresolved recovery cannot overlap even if the component rerenders", async () => {
	const timers = scheduler();
	let rejectAttempt: ((reason: Error) => void) | undefined;
	const recover = mock(
		() =>
			new Promise<void>((_resolve, reject) => {
				rejectAttempt = reject;
			}),
	);
	const view = renderHook(() => useFixture(recover, timers.schedule, true));
	await timers.next();
	view.rerender();
	expect(recover).toHaveBeenCalledTimes(1);
	expect(timers.pending.size).toBe(0);
	expect(view.result.current.recovering).toBe(true);
	await act(async () => rejectAttempt?.(new Error("same failure")));
	expect([...timers.pending.values()]).toEqual([1_000]);
});

test("disabling or unmounting cancels a scheduled retry without launching", async () => {
	const timers = scheduler();
	const recover = mock(async () => {
		throw new Error("same failure");
	});
	const view = renderHook(
		({ enabled }) => useFixture(recover, timers.schedule, enabled),
		{
			initialProps: { enabled: true },
		},
	);
	await timers.next();
	view.rerender({ enabled: false });
	expect(timers.pending.size).toBe(0);
	expect(view.result.current.recovering).toBe(false);
	view.rerender({ enabled: true });
	expect(timers.pending.size).toBe(1);
	view.unmount();
	expect(timers.pending.size).toBe(0);
	expect(recover).toHaveBeenCalledTimes(1);
});
