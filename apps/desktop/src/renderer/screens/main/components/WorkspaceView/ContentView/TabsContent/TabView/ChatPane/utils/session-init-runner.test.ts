import { describe, expect, it, mock } from "bun:test";
import {
	createSessionInitRunner,
	type SessionInitScope,
} from "./session-init-runner";

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

async function flushMicrotasks() {
	await Promise.resolve();
	await Promise.resolve();
}

describe("createSessionInitRunner", () => {
	it("ignores stale async failures after scope switch", async () => {
		const scopeA: SessionInitScope = {
			scopeKey: "org-1:ws-1:session-a",
			organizationId: "org-1",
			workspaceId: "ws-1",
			sessionId: "session-a",
		};
		const scopeB: SessionInitScope = {
			scopeKey: "org-1:ws-1:session-b",
			organizationId: "org-1",
			workspaceId: "ws-1",
			sessionId: "session-b",
		};
		let activeScopeKey = scopeA.scopeKey;
		const deferredA = createDeferred<void>();
		const scheduleRetryTimeout = mock(() => ({ id: "timeout" }));
		const setIsSessionInitializing = mock(() => {});
		const onRetryExhausted = mock(() => {});
		const reportCreateSessionError = mock(() => {});
		const createSessionRecord = mock(async (scope: SessionInitScope) => {
			if (scope.scopeKey === scopeA.scopeKey) {
				return deferredA.promise;
			}
		});

		const runner = createSessionInitRunner({
			maxRetries: 2,
			retryDelayMs: 10,
			hasCurrentSessionRecord: () => false,
			isScopeCurrent: (scopeKey) => scopeKey === activeScopeKey,
			setIsSessionInitializing,
			createSessionRecord,
			reportCreateSessionError,
			onRetryExhausted,
			scheduleRetryTimeout,
		});

		const runA = runner.run({ scope: scopeA, retryOnFailure: true });
		await flushMicrotasks();

		activeScopeKey = scopeB.scopeKey;
		runner.resetScope(scopeB.scopeKey);
		await runner.run({ scope: scopeB, retryOnFailure: true });

		deferredA.reject(new Error("session-a failed"));
		await runA;
		await flushMicrotasks();

		expect(createSessionRecord).toHaveBeenCalledTimes(2);
		expect(reportCreateSessionError).toHaveBeenCalledTimes(1);
		expect(scheduleRetryTimeout).toHaveBeenCalledTimes(0);
		expect(onRetryExhausted).toHaveBeenCalledTimes(0);
		expect(setIsSessionInitializing).toHaveBeenCalledWith(false);
	});

	it("stops after max retries and reports exhaustion once", async () => {
		const scope: SessionInitScope = {
			scopeKey: "org-1:ws-1:session-a",
			organizationId: "org-1",
			workspaceId: "ws-1",
			sessionId: "session-a",
		};
		const scheduledCallbacks: Array<() => void> = [];
		const scheduleRetryTimeout = (callback: () => void) => {
			scheduledCallbacks.push(callback);
			return callback;
		};
		const setIsSessionInitializing = mock(() => {});
		const reportCreateSessionError = mock(() => {});
		const onRetryExhausted = mock(() => {});
		const createSessionRecord = mock(async () => {
			throw new Error("network");
		});

		const runner = createSessionInitRunner({
			maxRetries: 2,
			retryDelayMs: 10,
			hasCurrentSessionRecord: () => false,
			isScopeCurrent: (scopeKey) => scopeKey === scope.scopeKey,
			setIsSessionInitializing,
			createSessionRecord,
			reportCreateSessionError,
			onRetryExhausted,
			scheduleRetryTimeout,
		});

		await runner.run({ scope, retryOnFailure: true });
		await flushMicrotasks();
		while (scheduledCallbacks.length > 0) {
			const next = scheduledCallbacks.shift();
			if (!next) break;
			next();
			await flushMicrotasks();
		}

		expect(createSessionRecord).toHaveBeenCalledTimes(3);
		expect(reportCreateSessionError).toHaveBeenCalledTimes(3);
		expect(onRetryExhausted).toHaveBeenCalledTimes(1);
		expect(setIsSessionInitializing).toHaveBeenCalledWith(false);
	});

	it("does not schedule retries for manual ensure attempts", async () => {
		const scope: SessionInitScope = {
			scopeKey: "org-1:ws-1:session-a",
			organizationId: "org-1",
			workspaceId: "ws-1",
			sessionId: "session-a",
		};
		const scheduleRetryTimeout = mock(() => ({ id: "timeout" }));
		const setIsSessionInitializing = mock(() => {});
		const reportCreateSessionError = mock(() => {});
		const onRetryExhausted = mock(() => {});

		const runner = createSessionInitRunner({
			maxRetries: 2,
			retryDelayMs: 10,
			hasCurrentSessionRecord: () => false,
			isScopeCurrent: (scopeKey) => scopeKey === scope.scopeKey,
			setIsSessionInitializing,
			createSessionRecord: async () => {
				throw new Error("manual fail");
			},
			reportCreateSessionError,
			onRetryExhausted,
			scheduleRetryTimeout,
		});

		const result = await runner.run({ scope, retryOnFailure: false });

		expect(result).toBe(false);
		expect(reportCreateSessionError).toHaveBeenCalledTimes(1);
		expect(scheduleRetryTimeout).toHaveBeenCalledTimes(0);
		expect(onRetryExhausted).toHaveBeenCalledTimes(0);
	});
});
