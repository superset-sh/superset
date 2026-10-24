import { describe, expect, test } from "bun:test";
import { parseProjectConfig } from "./parse";
import { getDefaultTerminal, resolveProjectConfig } from "./resolve";
import type { ProjectConfig } from "./schema";

function config(text: string): ProjectConfig {
	const result = parseProjectConfig(text);
	if (!result.ok) throw new Error(JSON.stringify(result.errors));
	return result.config;
}

describe("resolveProjectConfig", () => {
	const base = config(`
[setup]
run = ["./setup.sh"]
cwd = "apps/web"

[setup.cloud]
run = ["./setup.cloud.sh"]

[archive]
run = ["./archive.sh"]

[archive.cloud]
run = []

[terminals.dev]
run = "bun dev"
default = true

[terminals.docs]
run = "bun docs"
`);

	test("an environment table replaces only the keys it sets", () => {
		const resolved = resolveProjectConfig({
			base,
			local: null,
			environment: "cloud",
		});
		expect(resolved.setup).toEqual({
			commands: ["./setup.cloud.sh"],
			cwd: "apps/web",
		});
	});

	test("run = [] turns a phase off in one environment", () => {
		expect(
			resolveProjectConfig({ base, local: null, environment: "cloud" }).archive
				.commands,
		).toEqual([]);
		expect(
			resolveProjectConfig({ base, local: null, environment: "local" }).archive
				.commands,
		).toEqual(["./archive.sh"]);
	});

	test("the personal file replaces arrays and adds terminals, locally only", () => {
		const local = config(`
[setup]
run = ["./setup.sh", "direnv allow"]

[terminals.storybook]
run = "bun storybook"
`);
		const resolved = resolveProjectConfig({
			base,
			local,
			environment: "local",
		});
		expect(resolved.setup.commands).toEqual(["./setup.sh", "direnv allow"]);
		expect(resolved.setup.cwd).toBe("apps/web");
		expect(resolved.terminals.map((terminal) => terminal.name)).toEqual([
			"dev",
			"docs",
			"storybook",
		]);
		expect(
			resolveProjectConfig({ base, local, environment: "cloud" }).terminals,
		).toHaveLength(2);
	});

	test("a string run becomes one command; empty phases resolve to no commands", () => {
		const resolved = resolveProjectConfig({
			base,
			local: null,
			environment: "local",
		});
		expect(resolved.install.commands).toEqual([]);
		expect(getDefaultTerminal(resolved)?.commands).toEqual(["bun dev"]);
	});

	test("ports default their label to the name", () => {
		const resolved = resolveProjectConfig({
			base: config("[ports.web]\ndefault = 3000\n"),
			local: null,
			environment: "local",
		});
		expect(resolved.ports).toEqual([
			{ name: "web", default: 3000, label: "web", preview: false },
		]);
	});

	test("the first default terminal drives Run", () => {
		const resolved = resolveProjectConfig({
			base: config(
				'[terminals.a]\nrun = "a"\n[terminals.b]\nrun = "b"\ndefault = true\n[terminals.c]\nrun = "c"\ndefault = true\n',
			),
			local: null,
			environment: "local",
		});
		expect(getDefaultTerminal(resolved)?.name).toBe("b");
	});
});
