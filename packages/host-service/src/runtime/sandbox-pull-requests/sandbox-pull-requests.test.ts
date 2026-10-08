import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { startSandboxPullRequestReporter } from "./sandbox-pull-requests";

describe("startSandboxPullRequestReporter", () => {
	const realFetch = globalThis.fetch;
	type Linked = { repository: string; number: number; linkedAt: number };
	let bodies: Linked[][];
	let status: number;
	let linked: Linked[];
	let stop: () => void;

	async function advance(ms: number) {
		jest.advanceTimersByTime(ms);
		for (let i = 0; i < 10; i++) await Promise.resolve();
	}

	beforeEach(async () => {
		jest.useFakeTimers();
		bodies = [];
		status = 200;
		linked = [{ repository: "acme/app", number: 1, linkedAt: 100 }];
		globalThis.fetch = (async (url: string, init: RequestInit) => {
			expect(url).toBe("https://api.test/api/cloud-workspaces/w/pull-requests");
			expect(init.method).toBe("POST");
			expect((init.headers as Record<string, string>).authorization).toBe(
				"Bearer s",
			);
			bodies.push(JSON.parse(String(init.body)).pullRequests);
			return new Response(null, { status });
		}) as typeof fetch;
		stop = startSandboxPullRequestReporter({
			apiUrl: "https://api.test",
			workspaceId: "w",
			hostSecret: "s",
			read: async () => linked,
		});
		await advance(0);
	});

	afterEach(() => {
		stop();
		globalThis.fetch = realFetch;
		jest.useRealTimers();
	});

	test("sends each linked PR once", async () => {
		expect(bodies).toEqual([
			[{ repository: "acme/app", number: 1, linkedAt: 100 }],
		]);
		await advance(30_000);
		expect(bodies).toHaveLength(1);

		linked = [...linked, { repository: "acme/app", number: 2, linkedAt: 200 }];
		await advance(30_000);
		expect(bodies[1]).toEqual([
			{ repository: "acme/app", number: 2, linkedAt: 200 },
		]);
	});

	test("resends what failed, waiting longer each time", async () => {
		linked = [...linked, { repository: "acme/app", number: 2, linkedAt: 200 }];
		status = 500;
		await advance(30_000);
		expect(bodies).toHaveLength(2);
		await advance(59_000);
		expect(bodies).toHaveLength(2);
		status = 200;
		await advance(1_000);
		expect(bodies).toHaveLength(3);
		expect(bodies[2]).toEqual([
			{ repository: "acme/app", number: 2, linkedAt: 200 },
		]);
		await advance(30_000);
		expect(bodies).toHaveLength(3);
	});
});
