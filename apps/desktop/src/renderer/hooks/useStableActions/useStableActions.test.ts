import { describe, expect, test } from "bun:test";
import { createStableDelegate } from "./useStableActions";

describe("createStableDelegate", () => {
	test("calls the latest function while its own identity stays put", () => {
		let current = { greet: (name: string) => `hi ${name}` };
		const stable = createStableDelegate(() => current);
		const greet = stable.greet;
		expect(greet("a")).toBe("hi a");
		current = { greet: (name: string) => `yo ${name}` };
		expect(stable.greet).toBe(greet);
		expect(greet("a")).toBe("yo a");
	});

	test("delegates nested namespaces the same way", () => {
		let current = { tasks: { rename: (title: string) => `old ${title}` } };
		const stable = createStableDelegate(() => current);
		const tasks = stable.tasks;
		const rename = tasks.rename;
		current = { tasks: { rename: (title: string) => `new ${title}` } };
		expect(stable.tasks).toBe(tasks);
		expect(tasks.rename).toBe(rename);
		expect(rename("x")).toBe("new x");
	});

	test("passes plain values through at read time", () => {
		let current = { count: 1 };
		const stable = createStableDelegate(() => current);
		expect(stable.count).toBe(1);
		current = { count: 2 };
		expect(stable.count).toBe(2);
	});
});
