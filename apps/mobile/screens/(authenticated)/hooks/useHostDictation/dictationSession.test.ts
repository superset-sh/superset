import { describe, expect, test } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { createDictationSession, dictationEngineFor } from "./dictationSession";

const target = { machineId: "mac", hostUrl: "http://mac", hostName: "My Mac" };
const audio = { uri: "file:///recording.m4a", durationMs: 1000 };

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

describe("dictation engine", () => {
	test("only an enabled target with Superwhisper installed uses file recording, unresolved settings wait", () => {
		expect(dictationEngineFor(null, { data: undefined, isPending: true })).toBe(
			"apple",
		);
		expect(
			dictationEngineFor(target, { data: undefined, isPending: true }),
		).toBe("waiting");
		expect(
			dictationEngineFor(target, {
				data: { enabled: false, installed: true },
				isPending: false,
			}),
		).toBe("apple");
		expect(
			dictationEngineFor(target, {
				data: { enabled: true, installed: false },
				isPending: false,
			}),
		).toBe("apple");
		expect(
			dictationEngineFor(target, {
				data: { enabled: true, installed: true },
				isPending: false,
			}),
		).toBe("file");
	});
});

test.each([
	true,
	false,
])("keeps known dictation settings during and after a failed refetch (enabled: %s)", async (enabled) => {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: Infinity } },
	});
	const pending = deferred<{ enabled: boolean; installed: boolean }>();
	client.setQueryData(["dictation"], { enabled, installed: true });
	const observer = new QueryObserver(client, {
		queryKey: ["dictation"],
		queryFn: () => pending.promise,
	});
	const unsubscribe = observer.subscribe(() => {});
	try {
		const expected = enabled ? "file" : "apple";
		expect(observer.getCurrentResult().isFetching).toBe(true);
		expect(dictationEngineFor(target, observer.getCurrentResult())).toBe(
			expected,
		);
		const refetch = observer.refetch({ cancelRefetch: false });
		pending.reject(new Error("offline"));
		await refetch;
		expect(observer.getCurrentResult().isError).toBe(true);
		expect(dictationEngineFor(target, observer.getCurrentResult())).toBe(
			expected,
		);
	} finally {
		unsubscribe();
		client.clear();
	}
});

describe("dictation session", () => {
	test("appends the result and removes audio only after success", async () => {
		const pending = deferred<string>();
		const appended: string[] = [];
		const removed: string[] = [];
		const session = createDictationSession({
			transcribe: () => pending.promise,
			append: (text) => {
				appended.push(text);
			},
			remove: (uri) => removed.push(uri),
		});
		session.accept(audio, target);
		expect(session.getSnapshot().status).toBe("transcribing");
		expect(removed).toEqual([]);
		pending.resolve("hello");
		await pending.promise;
		await Promise.resolve();
		expect(appended).toEqual(["hello"]);
		expect(removed).toEqual([audio.uri]);
		expect(session.getSnapshot().status).toBe("idle");
	});

	test("waits for draft insertion before removing audio", async () => {
		const insertion = deferred<void>();
		const started = deferred<void>();
		const removed: string[] = [];
		const session = createDictationSession({
			transcribe: async () => "hello",
			append: () => {
				started.resolve();
				return insertion.promise;
			},
			remove: (uri) => removed.push(uri),
		});
		session.accept(audio, target);
		await started.promise;
		expect(session.getSnapshot().status).toBe("transcribing");
		expect(removed).toEqual([]);
		insertion.resolve();
		await insertion.promise;
		expect(removed).toEqual([audio.uri]);
		expect(session.getSnapshot().status).toBe("idle");
	});
	test("keeps audio if native draft insertion rejects", async () => {
		const failed = deferred<void>();
		const removed: string[] = [];
		const session = createDictationSession({
			transcribe: async () => "hello",
			append: () => failed.promise,
			remove: (uri) => removed.push(uri),
		});
		session.accept(audio, target);
		await Promise.resolve();
		failed.reject(new Error("native view detached"));
		await failed.promise.catch(() => {});
		expect(removed).toEqual([]);
		expect(session.getSnapshot().status).toBe("failed");
	});
	test("does not append an empty transcript", async () => {
		const pending = deferred<string>();
		const appended: string[] = [];
		const session = createDictationSession({
			transcribe: () => pending.promise,
			append: (text) => {
				appended.push(text);
			},
			remove: () => {},
		});
		session.accept(audio, target);
		pending.resolve("");
		await pending.promise;
		expect(appended).toEqual([]);
		expect(session.getSnapshot().status).toBe("idle");
	});
	test("retains the audio and original Mac on failure and retries once", async () => {
		const first = deferred<string>();
		const second = deferred<string>();
		const calls: unknown[] = [];
		const removed: string[] = [];
		const appended: string[] = [];
		const session = createDictationSession({
			transcribe: (recording, machine) => {
				calls.push([recording, machine]);
				return calls.length === 1 ? first.promise : second.promise;
			},
			append: (text) => {
				appended.push(text);
			},
			remove: (uri) => removed.push(uri),
		});
		session.accept(audio, target);
		first.reject(new Error("offline"));
		await first.promise.catch(() => {});
		expect(session.getSnapshot().status).toBe("failed");
		expect(removed).toEqual([]);
		const retry = session.retry();
		void session.retry();
		session.accept(
			{ ...audio, uri: "other" },
			{ ...target, machineId: "other" },
		);
		second.resolve("recovered");
		await retry;
		expect(calls).toEqual([
			[audio, target],
			[audio, target],
		]);
		expect(appended).toEqual(["recovered"]);
		expect(removed).toEqual([audio.uri]);
	});

	test("abandon removes a failed recording without appending", async () => {
		const pending = deferred<string>();
		const removed: string[] = [];
		const session = createDictationSession({
			transcribe: () => pending.promise,
			append: () => {
				throw new Error("must not append");
			},
			remove: (uri) => removed.push(uri),
		});
		session.accept(audio, target);
		session.abandon();
		expect(removed).toEqual([]);
		pending.reject(new Error("timeout"));
		await pending.promise.catch(() => {});
		session.abandon();
		expect(removed).toEqual([audio.uri]);
		expect(session.getSnapshot().status).toBe("idle");
	});
});
