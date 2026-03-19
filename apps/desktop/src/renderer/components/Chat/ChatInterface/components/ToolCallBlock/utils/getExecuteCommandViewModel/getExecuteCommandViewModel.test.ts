import { describe, expect, it } from "bun:test";
import { getExecuteCommandViewModel } from "./getExecuteCommandViewModel";

describe("getExecuteCommandViewModel", () => {
	it("extracts stdout from Mastra content blocks", () => {
		const model = getExecuteCommandViewModel({
			args: { command: "pwd" },
			result: {
				content: [{ type: "text", text: "/Users/kietho/workplace/superset\n" }],
				isError: false,
			},
		});

		expect(model.command).toBe("pwd");
		expect(model.stdout).toBe("/Users/kietho/workplace/superset\n");
		expect(model.stderr).toBeUndefined();
		expect(model.exitCode).toBeUndefined();
	});

	it("extracts nested stderr and exit code", () => {
		const model = getExecuteCommandViewModel({
			args: { command: "git status" },
			result: {
				result: {
					output: {
						stderr: "fatal: not a git repository",
						status_code: "128",
					},
				},
			},
		});

		expect(model.command).toBe("git status");
		expect(model.stderr).toBe("fatal: not a git repository");
		expect(model.exitCode).toBe(128);
	});

	it("falls back to stringified output object when no text output fields exist", () => {
		const model = getExecuteCommandViewModel({
			args: { command: "custom_tool" },
			result: {
				output: {
					foo: "bar",
					count: 2,
				},
			},
		});

		expect(model.command).toBe("custom_tool");
		expect(model.stdout).toContain('"foo": "bar"');
		expect(model.stdout).toContain('"count": 2');
	});
});
