import { describe, expect, test } from "bun:test";
import { waitForV1MigrationRunLock, withV1MigrationRunLock } from "./run-lock";

function fakeLock(busyFor: number) {
	let attempts = 0;
	const released: string[] = [];
	return {
		released,
		attempts: () => attempts,
		client: {
			acquire: async () => {
				attempts++;
				return attempts > busyFor
					? { acquired: true as const, token: `t${attempts}` }
					: { acquired: false as const };
			},
			release: async (token: string) => {
				released.push(token);
			},
		},
	};
}

const noWait = async () => {};

describe("withV1MigrationRunLock", () => {
	test("waits for the automatic pass, then runs and releases", async () => {
		const lock = fakeLock(2);
		const order: string[] = [];
		const result = await withV1MigrationRunLock(
			async () => {
				order.push(`ran after ${lock.attempts()} tries`);
				return "adopted";
			},
			{ client: lock.client, wait: noWait },
		);
		expect(result).toBe("adopted");
		expect(order).toEqual(["ran after 3 tries"]);
		expect(lock.released).toEqual(["t3"]);
	});

	test("releases the lock when the task throws", async () => {
		const lock = fakeLock(0);
		await expect(
			withV1MigrationRunLock(
				async () => {
					throw new Error("adopt failed");
				},
				{ client: lock.client, wait: noWait },
			),
		).rejects.toThrow("adopt failed");
		expect(lock.released).toEqual(["t1"]);
	});
});

describe("waitForV1MigrationRunLock", () => {
	test("stops waiting once the org is no longer active", async () => {
		const lock = fakeLock(Number.POSITIVE_INFINITY);
		let active = true;
		const token = await waitForV1MigrationRunLock({
			client: lock.client,
			shouldStop: () => !active,
			wait: async () => {
				if (lock.attempts() === 3) active = false;
			},
		});
		expect(token).toBeNull();
		expect(lock.attempts()).toBe(3);
	});

	test("gives back a lock it got after the org changed", async () => {
		const lock = fakeLock(0);
		let checks = 0;
		const token = await waitForV1MigrationRunLock({
			client: lock.client,
			shouldStop: () => ++checks > 1,
			wait: noWait,
		});
		expect(token).toBeNull();
		expect(lock.released).toEqual(["t1"]);
	});
});
