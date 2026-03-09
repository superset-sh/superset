import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPortCheckScript } from "./script-runner";

const TEST_DIR = join(tmpdir(), `superset-test-script-runner-${process.pid}`);

describe("runPortCheckScript", () => {
	beforeEach(() => {
		mkdirSync(TEST_DIR, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
	});

	test("parses valid JSON array output", async () => {
		const script = join(TEST_DIR, "check.sh");
		writeFileSync(
			script,
			'#!/bin/sh\necho \'[{"port": 3000, "name": "Frontend", "url": "https://local.dev:3000"}]\'',
		);
		await Bun.write(script, await Bun.file(script).text());
		const { execSync } = await import("node:child_process");
		execSync(`chmod +x ${script}`);

		const result = await runPortCheckScript(script, TEST_DIR);
		expect(result).toEqual([
			{ port: 3000, name: "Frontend", url: "https://local.dev:3000" },
		]);
	});

	test("parses output with multiple ports", async () => {
		const script = join(TEST_DIR, "check.sh");
		writeFileSync(
			script,
			`#!/bin/sh
echo '[{"port": 3000, "name": "Web"}, {"port": 8000, "name": "API", "pid": 12345}]'`,
		);
		const { execSync } = await import("node:child_process");
		execSync(`chmod +x ${script}`);

		const result = await runPortCheckScript(script, TEST_DIR);
		expect(result).toEqual([
			{ port: 3000, name: "Web" },
			{ port: 8000, name: "API", pid: 12345 },
		]);
	});

	test("returns empty array for empty stdout", async () => {
		const script = join(TEST_DIR, "check.sh");
		writeFileSync(script, "#!/bin/sh\necho ''");
		const { execSync } = await import("node:child_process");
		execSync(`chmod +x ${script}`);

		const result = await runPortCheckScript(script, TEST_DIR);
		expect(result).toEqual([]);
	});

	test("returns empty array for non-JSON output", async () => {
		const script = join(TEST_DIR, "check.sh");
		writeFileSync(script, "#!/bin/sh\necho 'not json'");
		const { execSync } = await import("node:child_process");
		execSync(`chmod +x ${script}`);

		const result = await runPortCheckScript(script, TEST_DIR);
		expect(result).toEqual([]);
	});

	test("returns empty array for non-array JSON", async () => {
		const script = join(TEST_DIR, "check.sh");
		writeFileSync(script, "#!/bin/sh\necho '{\"port\": 3000}'");
		const { execSync } = await import("node:child_process");
		execSync(`chmod +x ${script}`);

		const result = await runPortCheckScript(script, TEST_DIR);
		expect(result).toEqual([]);
	});

	test("skips invalid entries in array", async () => {
		const script = join(TEST_DIR, "check.sh");
		writeFileSync(
			script,
			`#!/bin/sh
echo '[{"port": 3000, "name": "Valid"}, "invalid", {"port": "bad"}, {"port": 8000}]'`,
		);
		const { execSync } = await import("node:child_process");
		execSync(`chmod +x ${script}`);

		const result = await runPortCheckScript(script, TEST_DIR);
		expect(result).toEqual([{ port: 3000, name: "Valid" }, { port: 8000 }]);
	});

	test("returns empty array when command fails", async () => {
		const result = await runPortCheckScript(
			"nonexistent-command-xyz",
			TEST_DIR,
		);
		expect(result).toEqual([]);
	});

	test("runs command with workspace path as cwd", async () => {
		const subdir = join(TEST_DIR, "workspace");
		mkdirSync(subdir, { recursive: true });
		const script = join(TEST_DIR, "check.sh");
		writeFileSync(
			script,
			`#!/bin/sh
echo "[{\\"port\\": 3000, \\"name\\": \\"$(basename $(pwd))\\"}]"`,
		);
		const { execSync } = await import("node:child_process");
		execSync(`chmod +x ${script}`);

		const result = await runPortCheckScript(script, subdir);
		expect(result).toEqual([{ port: 3000, name: "workspace" }]);
	});

	test("coerces string pid to number", async () => {
		const script = join(TEST_DIR, "check.sh");
		writeFileSync(
			script,
			`#!/bin/sh
echo '[{"port": 5050, "name": "API", "pid": "45763"}]'`,
		);
		const { execSync } = await import("node:child_process");
		execSync(`chmod +x ${script}`);

		const result = await runPortCheckScript(script, TEST_DIR);
		expect(result).toEqual([{ port: 5050, name: "API", pid: 45763 }]);
	});

	test("skips ports outside valid range", async () => {
		const script = join(TEST_DIR, "check.sh");
		writeFileSync(
			script,
			`#!/bin/sh
echo '[{"port": 0}, {"port": 65536}, {"port": 3000, "name": "Valid"}]'`,
		);
		const { execSync } = await import("node:child_process");
		execSync(`chmod +x ${script}`);

		const result = await runPortCheckScript(script, TEST_DIR);
		expect(result).toEqual([{ port: 3000, name: "Valid" }]);
	});
});
