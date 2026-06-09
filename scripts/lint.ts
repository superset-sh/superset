import { spawnSync } from "node:child_process";

interface ScanRule {
	message: string;
	pattern: string;
	paths: string[];
	args: string[];
}

function run(
	command: string,
	args: string[],
	options: { capture?: boolean } = {},
): { status: number; stdout: string; stderr: string } {
	const result = spawnSync(command, args, {
		encoding: "utf8",
		shell: false,
		stdio: options.capture ? "pipe" : "inherit",
		env: process.env,
	});

	if (result.error) {
		console.error(`[lint] Failed to run ${command}: ${result.error.message}`);
		return { status: 1, stdout: "", stderr: result.error.message };
	}

	return {
		status: result.status ?? 1,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
	};
}

function runBiome(): number {
	const args = process.argv.slice(2);
	if (args.includes("--skip-biome")) {
		return 0;
	}

	const result = run("bun", ["x", "@biomejs/biome@2.4.2", "check", ...args], {
		capture: true,
	});
	const output = `${result.stdout}${result.stderr}`;
	process.stdout.write(output);

	if (/Found \d+ (error|info|warning)/.test(output)) {
		return 1;
	}

	return result.status;
}

function runRipgrepRule(rule: ScanRule): boolean {
	const result = run(
		"rg",
		["-n", "-U", "--pcre2", rule.pattern, ...rule.paths, ...rule.args],
		{ capture: true },
	);

	if (result.status === 0) {
		console.error(rule.message);
		process.stderr.write(result.stdout);
		if (!result.stdout.endsWith("\n")) {
			process.stderr.write("\n");
		}
		process.stderr.write("\n");
		return false;
	}

	if (result.status === 1) {
		return true;
	}

	console.error(`[lint] ripgrep scan failed for rule: ${rule.message}`);
	process.stderr.write(result.stderr);
	return false;
}

function runCustomChecks(): number {
	const desktopGitEnvRules: ScanRule[] = [
		{
			message:
				"[desktop-git-env] Direct runtime imports from simple-git are forbidden. Use getSimpleGitWithShellPath from workspaces/utils/git-client.ts.",
			pattern: "^import(?!\\s+type\\b).*['\"]simple-git['\"]",
			paths: ["apps/desktop/src"],
			args: [
				"--glob",
				"!**/*.test.ts",
				"--glob",
				"!apps/desktop/src/lib/trpc/routers/workspaces/utils/git-client.ts",
			],
		},
		{
			message:
				"[desktop-git-env] Direct simpleGit(...) construction is forbidden outside git-client.ts.",
			pattern: "\\bsimpleGit\\(",
			paths: ["apps/desktop/src"],
			args: [
				"--glob",
				"!**/*.test.ts",
				"--glob",
				"!apps/desktop/src/lib/trpc/routers/workspaces/utils/git-client.ts",
			],
		},
		{
			message:
				"[desktop-git-env] Raw execFile/execFileAsync git calls are forbidden. Use execGitWithShellPath from workspaces/utils/git-client.ts.",
			pattern: "\\bexecFile(?:Async)?\\(\\s*['\"]git['\"]",
			paths: ["apps/desktop/src"],
			args: [
				"--glob",
				"!**/*.test.ts",
				"--glob",
				"!apps/desktop/src/lib/trpc/routers/workspaces/utils/git-client.ts",
			],
		},
		{
			message:
				'[desktop-git-env] execWithShellEnv("git", ...) is forbidden. Use execGitWithShellPath from workspaces/utils/git-client.ts.',
			pattern: "\\bexecWithShellEnv\\(\\s*['\"]git['\"]",
			paths: ["apps/desktop/src"],
			args: ["--glob", "!**/*.test.ts"],
		},
	];

	const gitRefRules: ScanRule[] = [
		{
			message:
				"[git-refs] '.startsWith(\"origin/\")' is forbidden - a local branch can be named 'origin/foo' and would be misclassified. Use ResolvedRef from @superset/host-service/git.",
			pattern: "\\.startsWith\\(\\s*['\"]origin/",
			paths: [],
			args: [
				"--type",
				"ts",
				"--glob",
				"!**/*.test.ts",
				"--glob",
				"!packages/host-service/src/runtime/git/refs.ts",
				"--glob",
				"!apps/desktop/src/lib/trpc/routers/**",
			],
		},
		{
			message:
				"[git-refs] '.replace(\"origin/\", ...)' is forbidden - same misclassification risk. Use ResolvedRef.shortName / .remote instead.",
			pattern: "\\.replace\\(\\s*['\"]origin/",
			paths: [],
			args: [
				"--type",
				"ts",
				"--glob",
				"!**/*.test.ts",
				"--glob",
				"!packages/host-service/src/runtime/git/refs.ts",
				"--glob",
				"!apps/desktop/src/lib/trpc/routers/**",
			],
		},
	];

	const simpleGitExcludes = [
		"--glob",
		"!**/*.test.ts",
		"--glob",
		"!**/*.bench.ts",
		"--glob",
		"!**/test/**",
		"--glob",
		"!apps/desktop/src/lib/trpc/routers/workspaces/utils/git-client.ts",
		"--glob",
		"!packages/host-service/src/runtime/git/simple-git.ts",
	];
	const simpleGitRules: ScanRule[] = [
		{
			message:
				"[simple-git] Direct runtime imports from simple-git are forbidden. Use apps/desktop git-client.ts or packages/host-service runtime/git/simple-git.ts.",
			pattern: "(?s)import(?!\\s+type\\b)[^;]*from\\s*['\"]simple-git['\"]",
			paths: ["apps", "packages"],
			args: simpleGitExcludes,
		},
		{
			message:
				'[simple-git] require("simple-git") is forbidden outside tests and approved wrappers.',
			pattern: "\\brequire\\(\\s*['\"]simple-git['\"]\\s*\\)",
			paths: ["apps", "packages"],
			args: simpleGitExcludes,
		},
		{
			message:
				"[simple-git] Direct simpleGit(...) construction is forbidden outside tests and approved wrappers.",
			pattern: "\\bsimpleGit\\(",
			paths: ["apps", "packages"],
			args: simpleGitExcludes,
		},
	];

	const rules = [...desktopGitEnvRules, ...gitRefRules, ...simpleGitRules];
	return rules.every(runRipgrepRule) ? 0 : 1;
}

const biomeStatus = runBiome();
const customStatus = runCustomChecks();
process.exit(biomeStatus === 0 && customStatus === 0 ? 0 : 1);
