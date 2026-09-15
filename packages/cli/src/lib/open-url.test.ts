import { describe, expect, mock, test } from "bun:test";
import * as realChildProcess from "node:child_process";
import { EventEmitter } from "node:events";

class FakeChild extends EventEmitter {
	unref = mock(() => undefined);
}

let nextChild = new FakeChild();
const spawnMock = mock(() => nextChild);

mock.module("node:child_process", () => ({
	...realChildProcess,
	spawn: spawnMock,
}));

const { openUrl } = await import("./open-url");

describe("openUrl", () => {
	test("resolves once the launcher has been spawned", async () => {
		nextChild = new FakeChild();
		const promise = openUrl("https://example.com");
		nextChild.emit("spawn");
		await expect(promise).resolves.toBeUndefined();
		expect(nextChild.unref).toHaveBeenCalled();
	});

	test("rejects when the launcher binary itself can't run", async () => {
		nextChild = new FakeChild();
		const promise = openUrl("https://example.com");
		nextChild.emit("error", new Error("ENOENT"));
		await expect(promise).rejects.toThrow("ENOENT");
	});

	test("does not wait for the launcher to exit", async () => {
		nextChild = new FakeChild();
		const promise = openUrl("https://example.com");
		nextChild.emit("spawn");
		await expect(promise).resolves.toBeUndefined();
		nextChild.emit("close", 1);
		await expect(promise).resolves.toBeUndefined();
	});
});
