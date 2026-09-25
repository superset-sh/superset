import { describe, expect, test } from "bun:test";
import { CommandDedupe } from "./commandDedupe";

describe("CommandDedupe", () => {
	test("runs a command once and replays the cached result", () => {
		const dedupe = new CommandDedupe();
		let calls = 0;
		const first = dedupe.run("command-1", () => {
			calls += 1;
			return { itemId: "item-1" };
		});
		const second = dedupe.run("command-1", () => {
			calls += 1;
			return { itemId: "item-2" };
		});

		expect(calls).toBe(1);
		expect(second).toBe(first);
	});

	test("keeps commands isolated by id", () => {
		const dedupe = new CommandDedupe();
		expect(dedupe.run("a", () => 1)).toBe(1);
		expect(dedupe.run("b", () => 2)).toBe(2);
		expect(dedupe.size).toBe(2);
	});

	test("evicts the least recently used command past capacity", () => {
		const dedupe = new CommandDedupe(2);
		dedupe.run("a", () => 1);
		dedupe.run("b", () => 2);
		dedupe.run("a", () => 99);
		dedupe.run("c", () => 3);

		expect(dedupe.size).toBe(2);
		expect(dedupe.has("b")).toBe(false);
		expect(dedupe.has("a")).toBe(true);
		expect(dedupe.has("c")).toBe(true);
	});
});
