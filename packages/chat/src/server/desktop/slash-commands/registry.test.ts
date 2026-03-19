import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	buildSlashCommandRegistry,
	clearSlashCommandRegistryCache,
	getSlashCommandRegistryCacheStats,
} from "./registry";

const testDirectories: string[] = [];

function makeTempDirectory(prefix: string): string {
	const directory = mkdtempSync(join(tmpdir(), prefix));
	testDirectories.push(directory);
	return directory;
}

function writeCommandFile(
	root: string,
	name: string,
	body: string,
	container: "commands" | "command" = "commands",
	commandRoot: ".claude" | ".agents" = ".claude",
): void {
	const commandFilePath = join(root, commandRoot, container, `${name}.md`);
	mkdirSync(dirname(commandFilePath), { recursive: true });
	writeFileSync(commandFilePath, body);
}

afterEach(() => {
	clearSlashCommandRegistryCache();
	for (const directory of testDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("buildSlashCommandRegistry", () => {
	it("prefers project commands over global commands with the same name", () => {
		const cwd = makeTempDirectory("slash-cwd-");
		const home = makeTempDirectory("slash-home-");

		writeCommandFile(
			cwd,
			"review",
			`---
description: Project review
---
Body`,
		);
		writeCommandFile(
			home,
			"review",
			`---
description: Global review
---
Body`,
		);
		writeCommandFile(
			home,
			"cleanup",
			`---
description: Global cleanup
---
Body`,
		);

		const registry = buildSlashCommandRegistry(cwd, {
			homeDirectory: home,
			includeBuiltIns: false,
		});

		expect(registry.map((command) => command.name)).toEqual([
			"review",
			"cleanup",
		]);
		expect(registry[0]?.description).toBe("Project review");
		expect(registry[0]?.source).toBe("project");
		expect(registry[1]?.source).toBe("global");
	});

	it("returns commands in deterministic name order within each source", () => {
		const cwd = makeTempDirectory("slash-cwd-");
		const home = makeTempDirectory("slash-home-");

		writeCommandFile(cwd, "zeta", "---\ndescription: zeta\n---");
		writeCommandFile(cwd, "alpha", "---\ndescription: alpha\n---");
		writeCommandFile(home, "omega", "---\ndescription: omega\n---");
		writeCommandFile(home, "beta", "---\ndescription: beta\n---");

		const registry = buildSlashCommandRegistry(cwd, {
			homeDirectory: home,
			includeBuiltIns: false,
		});

		expect(registry.map((command) => command.name)).toEqual([
			"alpha",
			"zeta",
			"beta",
			"omega",
		]);
	});

	it("loads nested command names using slash separators", () => {
		const cwd = makeTempDirectory("slash-cwd-");
		const home = makeTempDirectory("slash-home-");

		writeCommandFile(cwd, "frontend/component", "---\ndescription: c\n---");
		writeCommandFile(cwd, "frontend/fix", "---\ndescription: f\n---");

		const registry = buildSlashCommandRegistry(cwd, {
			homeDirectory: home,
			includeBuiltIns: false,
		});

		expect(registry.map((command) => command.name)).toEqual([
			"frontend/component",
			"frontend/fix",
		]);
	});

	it("loads commands from both .claude/commands and .claude/command", () => {
		const cwd = makeTempDirectory("slash-cwd-");
		const home = makeTempDirectory("slash-home-");

		writeCommandFile(
			cwd,
			"review",
			"---\ndescription: review\n---",
			"commands",
		);
		writeCommandFile(cwd, "commit", "---\ndescription: commit\n---", "command");

		const registry = buildSlashCommandRegistry(cwd, {
			homeDirectory: home,
			includeBuiltIns: false,
		});

		expect(registry.map((command) => command.name)).toEqual([
			"review",
			"commit",
		]);
		expect(registry.every((command) => command.source === "project")).toBe(
			true,
		);
	});

	it("loads commands from .agents/commands when .claude commands are absent", () => {
		const cwd = makeTempDirectory("slash-cwd-");
		const home = makeTempDirectory("slash-home-");

		writeCommandFile(
			cwd,
			"ship",
			"---\ndescription: ship from agents\n---",
			"commands",
			".agents",
		);

		const registry = buildSlashCommandRegistry(cwd, {
			homeDirectory: home,
			includeBuiltIns: false,
		});

		expect(registry.map((command) => command.name)).toEqual(["ship"]);
		expect(registry[0]?.description).toBe("ship from agents");
		expect(registry[0]?.source).toBe("project");
	});

	it("loads commands from .agents/command when .claude commands are absent", () => {
		const cwd = makeTempDirectory("slash-cwd-");
		const home = makeTempDirectory("slash-home-");

		writeCommandFile(
			cwd,
			"sync",
			"---\ndescription: sync from agents singular\n---",
			"command",
			".agents",
		);

		const registry = buildSlashCommandRegistry(cwd, {
			homeDirectory: home,
			includeBuiltIns: false,
		});

		expect(registry.map((command) => command.name)).toEqual(["sync"]);
		expect(registry[0]?.description).toBe("sync from agents singular");
		expect(registry[0]?.source).toBe("project");
	});

	it("loads aliases from frontmatter and normalizes them", () => {
		const cwd = makeTempDirectory("slash-cwd-");
		const home = makeTempDirectory("slash-home-");

		writeCommandFile(
			cwd,
			"ship",
			`---
description: Ship
aliases: [/release, publish, ship, publish]
---
Body`,
		);

		const registry = buildSlashCommandRegistry(cwd, {
			homeDirectory: home,
			includeBuiltIns: false,
		});
		const ship = registry.find((command) => command.name === "ship");

		expect(ship?.aliases).toEqual(["release", "publish"]);
	});

	it("includes built-in commands by default", () => {
		const cwd = makeTempDirectory("slash-cwd-");
		const home = makeTempDirectory("slash-home-");

		const registry = buildSlashCommandRegistry(cwd, { homeDirectory: home });
		expect(registry.some((command) => command.source === "builtin")).toBe(true);
		expect(registry.some((command) => command.name === "review")).toBe(true);
		expect(
			registry.some(
				(command) =>
					command.name === "new" && command.aliases.includes("clear"),
			),
		).toBe(true);
	});

	it("allows custom commands to override built-in names", () => {
		const cwd = makeTempDirectory("slash-cwd-");
		const home = makeTempDirectory("slash-home-");

		writeCommandFile(
			cwd,
			"review",
			`---
description: custom review
---
Body`,
		);

		const registry = buildSlashCommandRegistry(cwd, { homeDirectory: home });
		const review = registry.find((command) => command.name === "review");

		expect(review?.source).toBe("project");
		expect(review?.kind).toBe("custom");
		expect(review?.description).toBe("custom review");
	});

	it("uses cache for repeated lookups with the same options", () => {
		const cwd = makeTempDirectory("slash-cwd-");
		const home = makeTempDirectory("slash-home-");
		writeCommandFile(cwd, "review", "---\ndescription: cached\n---");

		const before = getSlashCommandRegistryCacheStats();
		buildSlashCommandRegistry(cwd, { homeDirectory: home });
		const afterFirst = getSlashCommandRegistryCacheStats();
		buildSlashCommandRegistry(cwd, { homeDirectory: home });
		const afterSecond = getSlashCommandRegistryCacheStats();

		expect(afterFirst.misses - before.misses).toBe(1);
		expect(afterFirst.hits - before.hits).toBe(0);
		expect(afterSecond.misses - afterFirst.misses).toBe(0);
		expect(afterSecond.hits - afterFirst.hits).toBe(1);
	});
});
