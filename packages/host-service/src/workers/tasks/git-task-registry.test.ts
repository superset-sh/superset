import { describe, expect, test } from "bun:test";
import * as gitTaskModule from "./git.ts";
import { gitTasks } from "./git.ts";

function isWorkerTaskDefinition(
	value: unknown,
): value is { type: string; handler: unknown } {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { type?: unknown }).type === "string" &&
		typeof (value as { handler?: unknown }).handler === "function"
	);
}

describe("gitTasks registry", () => {
	test("registers every exported worker task", () => {
		const exported = Object.entries(gitTaskModule)
			.filter(([, value]) => isWorkerTaskDefinition(value))
			.map(([name, value]) => ({
				name,
				type: (value as { type: string }).type,
			}));

		expect(exported.length).toBeGreaterThan(0);

		const registered = new Set(gitTasks.map((task) => task.type));
		const missing = exported.filter((task) => !registered.has(task.type));

		expect(missing.map((task) => `${task.name} (${task.type})`)).toEqual([]);
	});

	test("has no duplicate task types", () => {
		const types = gitTasks.map((task) => task.type);
		expect(types).toEqual([...new Set(types)]);
	});
});
