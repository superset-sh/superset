import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getProjectConfigCliScriptContent } from "./project-config-cli";

const TEST_ROOT = path.join(
	tmpdir(),
	`superset-project-config-cli-${process.pid}-${Date.now()}`,
);

describe("project config CLI", () => {
	let scriptPath: string;
	let projectRoot: string;
	let configPath: string;

	beforeEach(() => {
		scriptPath = path.join(TEST_ROOT, "superset-project-config.js");
		projectRoot = path.join(TEST_ROOT, "project");
		configPath = path.join(projectRoot, ".superset", "config.json");

		mkdirSync(projectRoot, { recursive: true });
		writeFileSync(scriptPath, getProjectConfigCliScriptContent(), {
			mode: 0o755,
		});
	});

	afterEach(() => {
		rmSync(TEST_ROOT, { recursive: true, force: true });
	});

	function runCli(args: string[]) {
		return execFileSync(process.execPath, [scriptPath, ...args], {
			encoding: "utf-8",
		});
	}

	it("shows missing config without creating it", () => {
		const output = JSON.parse(
			runCli(["show", "--project-root", projectRoot]),
		) as {
			exists: boolean;
			path: string;
			config: unknown;
		};

		expect(output.exists).toBe(false);
		expect(output.path).toBe(configPath);
		expect(output.config).toBeNull();
		expect(existsSync(configPath)).toBe(false);
	});

	it("writes setup and teardown commands while preserving existing fields", () => {
		mkdirSync(path.dirname(configPath), { recursive: true });
		writeFileSync(
			configPath,
			JSON.stringify(
				{
					name: "keep-me",
					setup: ["old setup"],
				},
				null,
				2,
			),
		);

		runCli([
			"write",
			"--project-root",
			projectRoot,
			"--setup-json",
			'["bun install","bun run dev"]',
			"--teardown",
			"docker compose down",
		]);

		const saved = JSON.parse(readFileSync(configPath, "utf-8")) as {
			name?: string;
			setup?: string[];
			teardown?: string[];
		};

		expect(saved).toEqual({
			name: "keep-me",
			setup: ["bun install", "bun run dev"],
			teardown: ["docker compose down"],
		});
	});
});
