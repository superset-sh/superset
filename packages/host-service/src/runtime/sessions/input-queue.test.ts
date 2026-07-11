import { describe, expect, test } from "bun:test";
import { AsyncInputQueue } from "./input-queue";

describe("AsyncInputQueue", () => {
	test("delivers buffered values in order", async () => {
		const queue = new AsyncInputQueue<string>();
		queue.push("first");
		queue.push("second");
		const iterator = queue[Symbol.asyncIterator]();
		expect(await iterator.next()).toEqual({ done: false, value: "first" });
		expect(await iterator.next()).toEqual({ done: false, value: "second" });
	});

	test("wakes a pending reader when input arrives", async () => {
		const queue = new AsyncInputQueue<string>();
		const iterator = queue[Symbol.asyncIterator]();
		const pending = iterator.next();
		queue.push("hello");
		expect(await pending).toEqual({ done: false, value: "hello" });
	});

	test("closing resolves pending and future readers", async () => {
		const queue = new AsyncInputQueue<string>();
		const iterator = queue[Symbol.asyncIterator]();
		const pending = iterator.next();
		queue.close();
		expect(await pending).toEqual({ done: true, value: undefined });
		expect(await iterator.next()).toEqual({ done: true, value: undefined });
	});

	test("rejects input after close", () => {
		const queue = new AsyncInputQueue<string>();
		queue.close();
		expect(() => queue.push("late")).toThrow("closed input queue");
	});
});
