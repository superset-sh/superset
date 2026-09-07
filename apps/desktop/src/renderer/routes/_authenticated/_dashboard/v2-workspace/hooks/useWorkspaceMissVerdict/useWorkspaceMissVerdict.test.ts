import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	mock,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import {
	type MissVerdictInput,
	planVerdictAction,
	runVerdictWindow,
	useWorkspaceMissVerdict,
} from "./useWorkspaceMissVerdict";

// happy-dom over the preloaded plain-object document so renderHook has a real
// DOM. Process-wide, so unregister in afterAll for the other renderer suites.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, renderHook } = await import("@testing-library/react");

// Not testing-library's waitFor: in a full-suite run it stays bound to the
// happy-dom window of whichever file imported it first, and once that file
// unregisters, its timers never fire and waitFor only times out. Poll on the
// live window's timer instead, flushing React inside act each round.
const liveSetTimeout = globalThis.setTimeout;
async function until(check: () => void, timeoutMs = 2_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		try {
			check();
			return;
		} catch (error) {
			if (Date.now() > deadline) throw error;
		}
		await act(async () => {
			await new Promise((resolve) => liveSetTimeout(resolve, 10));
		});
	}
}

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

const base: MissVerdictInput = {
	workspaceId: "ws-1",
	workspaceFound: false,
	suspended: false,
	hostsEnumerated: true,
	localHostDown: false,
};

describe("planVerdictAction", () => {
	it("opens a window for a routed, unfound, unsuspended id with the local host up", () => {
		expect(planVerdictAction(base)).toBe("open-window");
	});

	it("does nothing without a routed workspaceId", () => {
		expect(planVerdictAction({ ...base, workspaceId: null })).toBe("none");
	});

	it("does nothing when the row is already in the mirror", () => {
		expect(planVerdictAction({ ...base, workspaceFound: true })).toBe("none");
	});

	it("does nothing while a create transaction or failed entry owns the id", () => {
		expect(planVerdictAction({ ...base, suspended: true })).toBe("none");
	});

	it("waits for the host list to settle before judging (remote hosts may be unenumerated)", () => {
		expect(planVerdictAction({ ...base, hostsEnumerated: false })).toBe("none");
	});

	it("never judges while the local host-service has no port (starting, crash loop, gave up)", () => {
		expect(planVerdictAction({ ...base, localHostDown: true })).toBe("none");
	});
});

describe("runVerdictWindow", () => {
	it("reports an answer when the refetch resolves answered, and cancels the cap", async () => {
		let capCancelled = false;
		const schedule = () => () => {
			capCancelled = true;
		};
		const answered = await runVerdictWindow(
			() => Promise.resolve(true),
			5_000,
			schedule,
		);
		expect(answered).toBe(true);
		expect(capCancelled).toBe(true);
	});

	it("reports no answer when every host errored", async () => {
		const answered = await runVerdictWindow(
			() => Promise.resolve(false),
			5_000,
			() => () => {},
		);
		expect(answered).toBe(false);
	});

	it("reports no answer when the refetch rejects", async () => {
		const answered = await runVerdictWindow(
			() => Promise.reject(new Error("host unreachable")),
			5_000,
			() => () => {},
		);
		expect(answered).toBe(false);
	});

	it("reports no answer at the cap when the refetch hangs", async () => {
		let fireCap = () => {};
		const schedule = (fn: () => void) => {
			fireCap = fn;
			return () => {};
		};
		const window = runVerdictWindow(
			() => new Promise<boolean>(() => {}),
			5_000,
			schedule,
		);
		fireCap();
		expect(await window).toBe(false);
	});
});

/** The hook's fixed retry cadence after an unanswered window. */
const UNANSWERED_RETRY_MS = 5_000;
/** Short real cap so a hanging refetch settles within the test. */
const CAP_MS = 20;

describe("useWorkspaceMissVerdict", () => {
	// Only the 5 s retry is intercepted; every other timer (the cap, React,
	// waitFor's polling) runs for real. Fired by hand from the tests.
	const pendingRetries = new Map<number, () => void>();
	let nextTimerId = 1;
	const realSetTimeout = globalThis.setTimeout;
	const realClearTimeout = globalThis.clearTimeout;

	beforeEach(() => {
		pendingRetries.clear();
		globalThis.setTimeout = ((
			fn: () => void,
			ms?: number,
			...args: unknown[]
		) => {
			if (ms === UNANSWERED_RETRY_MS) {
				const id = nextTimerId++;
				pendingRetries.set(id, fn);
				return id;
			}
			return realSetTimeout(fn, ms, ...args);
		}) as typeof setTimeout;
		globalThis.clearTimeout = ((id?: unknown) => {
			if (typeof id === "number" && pendingRetries.delete(id)) return;
			realClearTimeout(id as number);
		}) as typeof clearTimeout;
	});

	afterEach(() => {
		globalThis.setTimeout = realSetTimeout;
		globalThis.clearTimeout = realClearTimeout;
	});

	function fireRetry() {
		const [id, fn] = [...pendingRetries.entries()][0] ?? [];
		if (id === undefined || !fn) throw new Error("no retry pending");
		pendingRetries.delete(id);
		act(() => fn());
	}

	/** A refetchAll whose outcome the test can change between calls. */
	function controllableRefetch(initial: () => Promise<boolean>) {
		const state = { impl: initial };
		const refetchAll = mock(() => state.impl());
		return {
			refetchAll,
			set: (impl: () => Promise<boolean>) => (state.impl = impl),
		};
	}

	function renderVerdict(
		refetchAll: () => Promise<boolean>,
		input: MissVerdictInput = base,
	) {
		return renderHook(
			({ input }: { input: MissVerdictInput }) =>
				useWorkspaceMissVerdict(input, refetchAll, CAP_MS),
			{ initialProps: { input } },
		);
	}

	it("is 'missing' once a host answered the post-request refetch without the row", async () => {
		const { refetchAll } = controllableRefetch(() => Promise.resolve(true));
		const { result } = renderVerdict(refetchAll);

		expect(result.current).toBeNull();
		await until(() => expect(result.current).toBe("missing"));
		expect(refetchAll).toHaveBeenCalledTimes(1);
		expect(pendingRetries.size).toBe(0);
	});

	it("is 'unanswered' when every host errored, and schedules a retry", async () => {
		const { refetchAll } = controllableRefetch(() => Promise.resolve(false));
		const { result } = renderVerdict(refetchAll);

		await until(() => expect(result.current).toBe("unanswered"));
		expect(refetchAll).toHaveBeenCalledTimes(1);
		expect(pendingRetries.size).toBe(1);
	});

	it("is 'unanswered' at the cap when the refetch hangs (wedged host)", async () => {
		const { refetchAll } = controllableRefetch(
			() => new Promise<boolean>(() => {}),
		);
		const { result } = renderVerdict(refetchAll);

		await until(() => expect(result.current).toBe("unanswered"));
		expect(pendingRetries.size).toBe(1);
	});

	it("asks again after an unanswered window and upgrades to 'missing' once a host answers", async () => {
		const { refetchAll, set } = controllableRefetch(() =>
			Promise.resolve(false),
		);
		const { result } = renderVerdict(refetchAll);
		await until(() => expect(result.current).toBe("unanswered"));

		set(() => Promise.resolve(true));
		fireRetry();

		await until(() => expect(result.current).toBe("missing"));
		expect(refetchAll).toHaveBeenCalledTimes(2);
		expect(pendingRetries.size).toBe(0);
	});

	it("keeps retrying while nobody answers", async () => {
		const { refetchAll } = controllableRefetch(() => Promise.resolve(false));
		const { result } = renderVerdict(refetchAll);
		await until(() => expect(result.current).toBe("unanswered"));

		fireRetry();
		await until(() => expect(refetchAll).toHaveBeenCalledTimes(2));
		await until(() => expect(pendingRetries.size).toBe(1));
		expect(result.current).toBe("unanswered");
	});

	it("drops the verdict on navigation and re-verifies the new id", async () => {
		const { refetchAll, set } = controllableRefetch(() =>
			Promise.resolve(true),
		);
		const { result, rerender } = renderVerdict(refetchAll);
		await until(() => expect(result.current).toBe("missing"));

		// Navigate to an id whose window never settles: the old verdict must
		// not leak onto it.
		set(() => new Promise<boolean>(() => {}));
		rerender({ input: { ...base, workspaceId: "ws-2" } });
		expect(result.current).toBeNull();
		expect(refetchAll).toHaveBeenCalledTimes(2);

		// Coming back to the first id re-verifies instead of trusting the
		// earlier visit.
		set(() => Promise.resolve(true));
		rerender({ input: base });
		expect(result.current).toBeNull();
		await until(() => expect(result.current).toBe("missing"));
		expect(refetchAll).toHaveBeenCalledTimes(3);
	});

	it("clears an unanswered verdict and its retry when the row arrives", async () => {
		const { refetchAll } = controllableRefetch(() => Promise.resolve(false));
		const { result, rerender } = renderVerdict(refetchAll);
		await until(() => expect(result.current).toBe("unanswered"));
		expect(pendingRetries.size).toBe(1);

		rerender({ input: { ...base, workspaceFound: true } });
		expect(result.current).toBeNull();
		expect(pendingRetries.size).toBe(0);
	});

	it("never opens a window while the local host-service has no port", async () => {
		const { refetchAll } = controllableRefetch(() => Promise.resolve(true));
		const { result, rerender } = renderVerdict(refetchAll, {
			...base,
			localHostDown: true,
		});

		await new Promise((resolve) => realSetTimeout(resolve, CAP_MS * 3));
		expect(result.current).toBeNull();
		expect(refetchAll).not.toHaveBeenCalled();

		// The port coming back is what opens the window.
		rerender({ input: base });
		await until(() => expect(result.current).toBe("missing"));
		expect(refetchAll).toHaveBeenCalledTimes(1);
	});
});
