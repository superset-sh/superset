/**
 * Build/release guard for the bundled Trellis Plugin Runtime.
 *
 * This intentionally executes the Trellis CLI with Bun, matching the preferred
 * runtime used by packaged host-service when initializing guided workflow files.
 * A missing transitive dependency here is a Superset packaging bug and must fail
 * before Canary/Release artifacts are uploaded.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, join, resolve } from "node:path";

const projectRoot = join(import.meta.dirname, "..");

function fail(message: string): never {
	console.error(`[validate:trellis-runtime] ${message}`);
	process.exit(1);
}

function parseArgs(): { appDir?: string; nodeModulesDir?: string } {
	const args = process.argv.slice(2);
	const parsed: { appDir?: string; nodeModulesDir?: string } = {};

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--app-dir") {
			const value = args[index + 1];
			if (!value) fail("--app-dir requires a value");
			parsed.appDir = value;
			index += 1;
			continue;
		}
		if (arg === "--node-modules") {
			const value = args[index + 1];
			if (!value) fail("--node-modules requires a value");
			parsed.nodeModulesDir = value;
			index += 1;
			continue;
		}
		fail(`Unknown argument: ${arg}`);
	}

	return parsed;
}

function resolveNodeModulesDir(): string {
	const args = parseArgs();
	if (args.nodeModulesDir) return resolve(args.nodeModulesDir);

	if (args.appDir) {
		const macResources = join(
			args.appDir,
			"Contents",
			"Resources",
			"node_modules",
		);
		if (existsSync(macResources)) return resolve(macResources);

		const linuxResources = join(args.appDir, "resources", "node_modules");
		if (existsSync(linuxResources)) return resolve(linuxResources);

		const macUnpacked = join(
			args.appDir,
			"Contents",
			"Resources",
			"app.asar.unpacked",
			"node_modules",
		);
		if (existsSync(macUnpacked)) return resolve(macUnpacked);

		const linuxUnpacked = join(
			args.appDir,
			"resources",
			"app.asar.unpacked",
			"node_modules",
		);
		if (existsSync(linuxUnpacked)) return resolve(linuxUnpacked);

		fail(
			[
				"Could not find packaged node_modules for app bundle.",
				`App dir: ${args.appDir}`,
			].join("\n"),
		);
	}

	return join(projectRoot, "node_modules");
}

function resolveBunExecutable(): string {
	const candidates = [
		process.env.BUN_EXECUTABLE,
		basename(process.execPath).startsWith("bun") ? process.execPath : undefined,
		...(process.env.PATH ?? "")
			.split(delimiter)
			.filter(Boolean)
			.map((entry) => join(entry, "bun")),
	].filter((candidate): candidate is string => Boolean(candidate));

	const bun = candidates.find((candidate) => existsSync(candidate));
	if (!bun) {
		fail("Bun executable not found. Trellis packaged runtime smoke needs Bun.");
	}
	return bun;
}

function run(
	command: string,
	args: string[],
	cwd: string,
): { stdout: string; stderr: string } {
	const result = spawnSync(command, args, {
		cwd,
		encoding: "utf8",
		env: {
			...process.env,
			CI: "1",
		},
	});

	if (result.status !== 0) {
		fail(
			[
				"Command failed.",
				`cwd: ${cwd}`,
				`command: ${command} ${args.join(" ")}`,
				result.stderr?.trim() ? `stderr:\n${result.stderr.trim()}` : "",
				result.stdout?.trim() ? `stdout:\n${result.stdout.trim()}` : "",
			]
				.filter(Boolean)
				.join("\n"),
		);
	}

	return {
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
	};
}

function assertExists(path: string, reason: string): void {
	if (!existsSync(path)) {
		fail(`${reason}\nMissing path: ${path}`);
	}
}

function smokeInit(args: {
	bun: string;
	platform: "claude" | "codex";
	trellisBinPath: string;
}): void {
	const repoPath = mkdtempSync(
		join(tmpdir(), `superset-trellis-${args.platform}-`),
	);
	try {
		run("git", ["init", "-q"], repoPath);
		run(
			args.bun,
			[
				args.trellisBinPath,
				"init",
				"--yes",
				"--skip-existing",
				`--${args.platform}`,
			],
			repoPath,
		);

		assertExists(
			join(repoPath, ".trellis", "config.yaml"),
			`Trellis ${args.platform} init did not write config.yaml.`,
		);
		assertExists(
			join(repoPath, ".trellis", "tasks"),
			`Trellis ${args.platform} init did not create tasks directory.`,
		);
	} finally {
		rmSync(repoPath, { force: true, recursive: true });
	}
}

function main(): void {
	const nodeModulesDir = resolveNodeModulesDir();
	const trellisBinPath = join(
		nodeModulesDir,
		"@mindfoldhq",
		"trellis",
		"bin",
		"trellis.js",
	);
	assertExists(trellisBinPath, "Bundled Trellis CLI entrypoint is missing.");

	const bun = resolveBunExecutable();
	run(bun, [trellisBinPath, "--help"], projectRoot);
	smokeInit({ bun, platform: "claude", trellisBinPath });
	smokeInit({ bun, platform: "codex", trellisBinPath });

	console.log(
		`[validate:trellis-runtime] OK: Trellis runtime starts and initializes via ${bun}`,
	);
}

main();
