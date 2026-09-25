import { describe, expect, test } from "bun:test";
import { createSerialQueue } from "./serial-queue";

function deferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve!: () => void;
	const promise = new Promise<void>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

describe("createSerialQueue", () => {
	test("a second job does not start until the first settles", async () => {
		const queue = createSerialQueue();
		const started: string[] = [];
		const first = deferred();

		void queue(async () => {
			started.push("install");
			await first.promise;
		});
		const second = queue(async () => {
			started.push("remove");
		});

		await Promise.resolve();
		expect(started).toEqual(["install"]);

		first.resolve();
		await second;
		expect(started).toEqual(["install", "remove"]);
	});

	test("runs in the order handed over, not the order they finish", async () => {
		const queue = createSerialQueue();
		const finished: number[] = [];

		const jobs = [30, 0, 10].map((delay, index) =>
			queue(async () => {
				await new Promise((resolve) => setTimeout(resolve, delay));
				finished.push(index);
			}),
		);

		await Promise.all(jobs);
		expect(finished).toEqual([0, 1, 2]);
	});

	test("a rejected job does not stall the queue", async () => {
		const queue = createSerialQueue();
		const ran: string[] = [];

		const failing = queue(async () => {
			ran.push("failed");
			throw new Error("spawn failed");
		});
		await expect(failing).rejects.toThrow("spawn failed");

		await queue(async () => {
			ran.push("after");
		});
		expect(ran).toEqual(["failed", "after"]);
	});
});
