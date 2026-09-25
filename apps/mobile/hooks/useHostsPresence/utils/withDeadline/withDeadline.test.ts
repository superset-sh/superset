import { describe, expect, test } from "bun:test";
import { withDeadline } from "./withDeadline";

describe("withDeadline", () => {
	test("passes a result through", async () => {
		expect(await withDeadline(() => Promise.resolve(7), 50)).toBe(7);
	});

	test("passes a rejection through", async () => {
		await expect(
			withDeadline(() => Promise.reject(new Error("boom")), 50),
		).rejects.toThrow("boom");
	});

	test("rejects work that never settles", async () => {
		await expect(withDeadline(() => new Promise(() => {}), 20)).rejects.toThrow(
			"timed out",
		);
	});
});

test("deadline aborts an in-flight HTTP request", async () => {
	let markStarted!: () => void;
	const started = new Promise<void>((resolve) => {
		markStarted = resolve;
	});
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch() {
			markStarted();
			return new Promise<Response>(() => {});
		},
	});
	let request: Promise<Response> | undefined;
	try {
		const result = withDeadline((signal) => {
			request = fetch(server.url, { signal });
			return request;
		}, 200);
		const timedOut = expect(result).rejects.toThrow("timed out");
		await started;
		await timedOut;
		await expect(request).rejects.toThrow();
	} finally {
		server.stop(true);
	}
});

test("query cancellation aborts work without waiting for the deadline", async () => {
	const parent = new AbortController();
	let requestSignal: AbortSignal | undefined;
	const result = withDeadline(
		(signal) => {
			requestSignal = signal;
			return new Promise(() => {});
		},
		10_000,
		parent.signal,
	);
	await Promise.resolve();
	parent.abort();
	await expect(result).rejects.toThrow("cancelled");
	expect(requestSignal?.aborted).toBe(true);
});

test("does not start work for an already cancelled query", async () => {
	const parent = new AbortController();
	parent.abort();
	let called = false;
	await expect(
		withDeadline(
			async () => {
				called = true;
			},
			50,
			parent.signal,
		),
	).rejects.toThrow("cancelled");
	expect(called).toBe(false);
});

test("cleans up the deadline and parent listener after success", async () => {
	const parent = new AbortController();
	let requestSignal: AbortSignal | undefined;
	await withDeadline(
		async (signal) => {
			requestSignal = signal;
		},
		10,
		parent.signal,
	);
	parent.abort();
	await Bun.sleep(20);
	expect(requestSignal?.aborted).toBe(false);
});

test("a failed batch cancels other work sharing the signal", async () => {
	let requestSignal: AbortSignal | undefined;
	await expect(
		withDeadline(async (signal) => {
			requestSignal = signal;
			throw new Error("batch failed");
		}, 50),
	).rejects.toThrow("batch failed");
	expect(requestSignal?.aborted).toBe(true);
});
