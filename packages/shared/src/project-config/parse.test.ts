import { describe, expect, test } from "bun:test";
import { parseProjectConfig } from "./parse";

const REFERENCE = `
[install]
run = ["bun install"]

[setup]
run = ["./.superset/setup.sh"]

[setup.cloud]
run = ["./.superset/setup.cloud.sh"]

[terminals.dev]
run = "bun dev"
default = true

[terminals.dev.cloud]
run = "./.superset/dev-stack.cloud.sh"

[archive]
run = ["./.superset/archive.sh"]

[archive.cloud]
run = ["./.superset/archive.cloud.sh"]

[ports.web]
default = 3000
label = "Web"
preview = true
`;

describe("parseProjectConfig", () => {
	test("parses the reference file", () => {
		const result = parseProjectConfig(REFERENCE);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.config.setup?.cloud?.run).toEqual([
			"./.superset/setup.cloud.sh",
		]);
		expect(result.config.terminals?.dev?.default).toBe(true);
	});

	test("reports TOML syntax errors with a line", () => {
		const result = parseProjectConfig('[setup]\nrun = ["a",\n');
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors[0]?.line).toBeGreaterThan(0);
	});

	test("rejects an unknown key and points at its line", () => {
		const result = parseProjectConfig(
			'[terminals.dev]\nrun = "bun dev"\ndefualt = true\n',
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors[0]?.message).toContain("defualt");
		expect(result.errors[0]?.line).toBe(3);
	});

	test("rejects names that can't become variables", () => {
		const result = parseProjectConfig("[ports.web-ui]\ndefault = 3000\n");
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.errors[0]?.message).toContain("lowercase");
	});

	test("rejects unknown top-level tables", () => {
		const result = parseProjectConfig('[files]\ncopy = [".env"]\n');
		expect(result.ok).toBe(false);
	});

	test("allows a terminal named cloud", () => {
		expect(parseProjectConfig('[terminals.cloud]\nrun = "x"\n').ok).toBe(true);
	});

	test("accepts an empty file", () => {
		expect(parseProjectConfig("").ok).toBe(true);
	});
});
