import { describe, expect, test } from "bun:test";
import { parseConfigContent, toCommandsArray } from "./V2ScriptsEditor";

describe("parseConfigContent", () => {
	test("returns empty strings when content is null", () => {
		expect(parseConfigContent(null)).toEqual({ setup: "", teardown: "" });
	});

	test("returns empty strings when content is empty string", () => {
		expect(parseConfigContent("")).toEqual({ setup: "", teardown: "" });
	});

	test("returns empty strings when JSON is malformed", () => {
		expect(parseConfigContent("{not valid json,,,")).toEqual({
			setup: "",
			teardown: "",
		});
	});

	test("joins setup and teardown arrays with newlines", () => {
		expect(
			parseConfigContent(
				JSON.stringify({
					setup: ["bun install", "bun run db:migrate"],
					teardown: ["docker compose down"],
				}),
			),
		).toEqual({
			setup: "bun install\nbun run db:migrate",
			teardown: "docker compose down",
		});
	});

	test("returns empty strings when arrays are missing", () => {
		expect(parseConfigContent(JSON.stringify({ run: ["bun dev"] }))).toEqual({
			setup: "",
			teardown: "",
		});
	});

	test("filters out non-string entries from setup/teardown arrays", () => {
		expect(
			parseConfigContent(
				JSON.stringify({
					setup: ["bun install", 42, null, "bun run"],
					teardown: ["valid", { foo: "bar" }],
				}),
			),
		).toEqual({
			setup: "bun install\nbun run",
			teardown: "valid",
		});
	});

	test("handles different content for different projects (the data path the editor relies on)", () => {
		const projectA = parseConfigContent(
			JSON.stringify({ setup: ["a"], teardown: ["a-down"] }),
		);
		const projectB = parseConfigContent(
			JSON.stringify({ setup: ["b"], teardown: ["b-down"] }),
		);

		expect(projectA).not.toEqual(projectB);
		expect(projectA.setup).toBe("a");
		expect(projectB.setup).toBe("b");
	});
});

describe("toCommandsArray", () => {
	test("splits on newlines and trims each line", () => {
		expect(toCommandsArray("  bun install  \n  bun run db:migrate  ")).toEqual([
			"bun install",
			"bun run db:migrate",
		]);
	});

	test("filters out empty/whitespace-only lines", () => {
		expect(toCommandsArray("a\n\n  \nb\n   ")).toEqual(["a", "b"]);
	});

	test("returns empty array for empty input", () => {
		expect(toCommandsArray("")).toEqual([]);
		expect(toCommandsArray("   ")).toEqual([]);
		expect(toCommandsArray("\n\n\n")).toEqual([]);
	});

	test("round-trips through parseConfigContent", () => {
		const original = ["bun install", "bun run db:migrate"];
		const text = original.join("\n");
		const back = toCommandsArray(text);
		expect(back).toEqual(original);
	});
});
