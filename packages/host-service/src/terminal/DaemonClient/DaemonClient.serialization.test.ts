import { describe, expect, test } from "bun:test";
import type { ServerMessage } from "@superset/pty-daemon/protocol";
import { DaemonClient } from "./DaemonClient.ts";

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe("DaemonClient non-session request serialization", () => {
	test("a second list cannot consume the first request's uncorrelated reply", async () => {
		const client = new DaemonClient({ socketPath: "/unused-in-unit-test" });
		const firstReply = deferred<ServerMessage>();
		const secondReply = deferred<ServerMessage>();
		let calls = 0;
		(
			client as unknown as {
				requestNonSession: () => Promise<ServerMessage>;
			}
		).requestNonSession = () => {
			calls += 1;
			return calls === 1 ? firstReply.promise : secondReply.promise;
		};

		const first = client.list();
		const second = client.list();
		await Promise.resolve();
		expect(calls).toBe(1);

		firstReply.resolve({ type: "list-reply", sessions: [] });
		await first;
		await Promise.resolve();
		expect(calls).toBe(2);

		secondReply.resolve({ type: "list-reply", sessions: [] });
		await second;
	});

	test("a failed request does not permanently block the request lane", async () => {
		const client = new DaemonClient({ socketPath: "/unused-in-unit-test" });
		let calls = 0;
		(
			client as unknown as {
				requestNonSession: () => Promise<ServerMessage>;
			}
		).requestNonSession = async () => {
			calls += 1;
			if (calls === 1) throw new Error("transport failed");
			return { type: "list-reply", sessions: [] };
		};

		await expect(client.list()).rejects.toThrow("transport failed");
		await expect(client.list()).resolves.toEqual([]);
		expect(calls).toBe(2);
	});
});
