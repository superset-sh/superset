import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const temporaryDirectories: string[] = [];
afterEach(() => {
	for (const directory of temporaryDirectories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});

function validate(platform: string, arch: string, archiveExists = true) {
	const directory = mkdtempSync(join(tmpdir(), "packaged-runtime-test-"));
	temporaryDirectories.push(directory);
	const executable = join(directory, "electron");
	const archive = join(directory, "app.asar");
	writeFileSync(
		executable,
		`#!${process.execPath}
const checks = process.argv[3].split("const moduleApi=")[0];
Function(checks)();
console.error("native probe invoked");
process.exit(17);
`,
		{ mode: 0o755 },
	);
	if (archiveExists) writeFileSync(archive, "fixture");
	const result = Bun.spawnSync({
		cmd: [
			process.execPath,
			"--no-env-file",
			join(import.meta.dir, "validate-packaged-modules.ts"),
			executable,
			archive,
			platform,
			arch,
		],
		env: { PATH: process.env.PATH ?? "" },
		stdout: "pipe",
		stderr: "pipe",
		timeout: 5_000,
	});
	return {
		stdout: new TextDecoder().decode(result.stdout),
		stderr: new TextDecoder().decode(result.stderr),
		exitCode: result.exitCode,
	};
}

test("foreign platforms retain packaging and require target runtime acceptance", () => {
	const platform = process.platform === "darwin" ? "linux" : "darwin";
	const result = validate(platform, process.arch);
	expect(result.exitCode).toBe(0);
	expect(result.stderr).toBe("");
	expect(JSON.parse(result.stdout)).toMatchObject({
		packagedRuntime: false,
		platform,
		arch: process.arch,
		pendingAcceptance: ["packaged-runtime-on-target"],
	});
});

test("foreign architectures do not execute the target Electron binary", () => {
	const result = validate(
		process.platform,
		process.arch === "arm64" ? "x64" : "arm64",
	);
	expect(result.exitCode).toBe(0);
	expect(result.stderr).toBe("");
	expect(JSON.parse(result.stdout).packagedRuntime).toBe(false);
});

test("native targets still execute the runtime probe and enforce failures", () => {
	const result = validate(process.platform, process.arch);
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain("native probe invoked");
	expect(result.stderr).toContain("Packaged runtime module validation failed");
});

test("foreign targets still require the packaged archive", () => {
	const platform = process.platform === "darwin" ? "linux" : "darwin";
	const result = validate(platform, process.arch, false);
	expect(result.exitCode).not.toBe(0);
	expect(result.stderr).toContain(
		"Provide the exact packaged Electron executable and app.asar",
	);
	expect(result.stderr).not.toContain("native probe invoked");
});

test.skipIf(process.platform !== "darwin")(
	"universal macOS targets execute the native slice",
	() => {
		const result = validate("darwin", "universal");
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr).toContain("native probe invoked");
	},
);
