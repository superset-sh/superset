import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import {
	chmodSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	createBashWrapper,
	createZshWrapper,
	getCommandShellArgs,
	getShellArgs,
	type ShellWrapperPaths,
} from "./shell-wrappers";

const TEST_ROOT = path.join(
	tmpdir(),
	`superset-shell-wrappers-${process.pid}-${Date.now()}`,
);
const TEST_BIN_DIR = path.join(TEST_ROOT, "bin");
const TEST_ZSH_DIR = path.join(TEST_ROOT, "zsh");
const TEST_BASH_DIR = path.join(TEST_ROOT, "bash");
const TEST_PATHS: ShellWrapperPaths = {
	BIN_DIR: TEST_BIN_DIR,
	ZSH_DIR: TEST_ZSH_DIR,
	BASH_DIR: TEST_BASH_DIR,
};
const SPECIAL_SHELL_PATH_SEGMENT = `special $USER "quoted" 'single'`;

function quoteShellLiteral(value: string): string {
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function isZshAvailable(): boolean {
	try {
		execFileSync("zsh", ["-lc", "exit 0"], { stdio: "ignore" });
		return true;
	} catch (error) {
		const errorCode =
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			typeof error.code === "string"
				? error.code
				: "";
		if (errorCode === "ENOENT") return false;
		throw error;
	}
}

describe("shell-wrappers", () => {
	beforeEach(() => {
		mkdirSync(TEST_BIN_DIR, { recursive: true });
		mkdirSync(TEST_ZSH_DIR, { recursive: true });
		mkdirSync(TEST_BASH_DIR, { recursive: true });
	});

	afterEach(() => {
		rmSync(TEST_ROOT, { recursive: true, force: true });
	});

	it("creates zsh wrappers with interactive .zlogin sourcing and idempotent PATH prepend", () => {
		createZshWrapper(TEST_PATHS);

		const zshenv = readFileSync(path.join(TEST_ZSH_DIR, ".zshenv"), "utf-8");
		const zprofile = readFileSync(
			path.join(TEST_ZSH_DIR, ".zprofile"),
			"utf-8",
		);
		const zshrc = readFileSync(path.join(TEST_ZSH_DIR, ".zshrc"), "utf-8");
		const zlogin = readFileSync(path.join(TEST_ZSH_DIR, ".zlogin"), "utf-8");

		expect(zshenv).toContain('source "$_superset_home/.zshenv"');
		expect(zshenv).toContain(
			`export ZDOTDIR=${quoteShellLiteral(TEST_ZSH_DIR)}`,
		);
		expect(zprofile).toContain('export ZDOTDIR="$_superset_home"');
		expect(zprofile).toContain('source "$_superset_home/.zprofile"');
		expect(zprofile).toContain(
			`export ZDOTDIR=${quoteShellLiteral(TEST_ZSH_DIR)}`,
		);
		expect(zprofile.indexOf('export ZDOTDIR="$_superset_home"')).toBeLessThan(
			zprofile.indexOf('source "$_superset_home/.zprofile"'),
		);

		expect(zshrc).toContain("_superset_prepend_bin()");
		expect(zshrc).toContain(
			`export PATH=${quoteShellLiteral(TEST_BIN_DIR)}:"$PATH"`,
		);
		expect(zshrc).not.toContain(`claude() { "${TEST_BIN_DIR}/claude" "$@"; }`);
		expect(zshrc).toContain("rehash 2>/dev/null || true");
		expect(zshrc).toContain('export ZDOTDIR="$_superset_home"');
		expect(zshrc).toContain('source "$_superset_home/.zshrc"');
		expect(zshrc.indexOf('export ZDOTDIR="$_superset_home"')).toBeLessThan(
			zshrc.indexOf('source "$_superset_home/.zshrc"'),
		);

		// precmd hook should be registered to survive PATH resets by tools like mise/asdf
		expect(zshrc).toContain("typeset -ga precmd_functions 2>/dev/null || true");
		expect(zshrc).toContain(
			`precmd_functions=(\${precmd_functions:#_superset_ensure_path} _superset_ensure_path)`,
		);
		expect(zshrc).toContain("_superset_ensure_path()");

		expect(zlogin).toContain("if [[ -o interactive ]]; then");
		expect(zlogin).toContain('export ZDOTDIR="$_superset_home"');
		expect(zlogin).toContain('source "$_superset_home/.zlogin"');
		expect(zlogin.indexOf('export ZDOTDIR="$_superset_home"')).toBeLessThan(
			zlogin.indexOf('source "$_superset_home/.zlogin"'),
		);
		expect(zlogin).toContain("_superset_prepend_bin()");
		expect(zlogin).toContain(
			`export PATH=${quoteShellLiteral(TEST_BIN_DIR)}:"$PATH"`,
		);
		expect(zlogin).toContain(
			"typeset -ga precmd_functions 2>/dev/null || true",
		);
		expect(zlogin).toContain(
			`precmd_functions=(\${precmd_functions:#_superset_ensure_path} _superset_ensure_path)`,
		);
		expect(zlogin).not.toContain(`claude() { "${TEST_BIN_DIR}/claude" "$@"; }`);
		expect(zlogin).toContain("rehash 2>/dev/null || true");
	});

	it("creates bash wrapper without persistent command shims and with idempotent PATH prepend", () => {
		createZshWrapper(TEST_PATHS);
		createBashWrapper(TEST_PATHS);

		const zshrc = readFileSync(path.join(TEST_ZSH_DIR, ".zshrc"), "utf-8");
		const zlogin = readFileSync(path.join(TEST_ZSH_DIR, ".zlogin"), "utf-8");
		const rcfile = readFileSync(path.join(TEST_BASH_DIR, "rcfile"), "utf-8");

		expect(zshrc).toContain("_superset_prepend_bin()");
		expect(zshrc).toContain(
			`export PATH=${quoteShellLiteral(TEST_BIN_DIR)}:"$PATH"`,
		);
		expect(zshrc).not.toContain(`claude() { "${TEST_BIN_DIR}/claude" "$@"; }`);
		expect(zlogin).toContain("_superset_prepend_bin()");
		expect(zlogin).not.toContain(`claude() { "${TEST_BIN_DIR}/claude" "$@"; }`);
		expect(rcfile).toContain("_superset_prepend_bin()");
		expect(rcfile).toContain(
			`export PATH=${quoteShellLiteral(TEST_BIN_DIR)}:"$PATH"`,
		);
		expect(rcfile).not.toContain(`claude() { "${TEST_BIN_DIR}/claude" "$@"; }`);
	});

	it("reproduces pre-fix .zlogin behavior where system node wins", () => {
		if (!isZshAvailable()) return;

		const integrationRoot = path.join(TEST_ROOT, "zlogin-node-repro");
		const integrationBinDir = path.join(integrationRoot, "superset-bin");
		const integrationZshDir = path.join(integrationRoot, "zsh");
		const integrationBashDir = path.join(integrationRoot, "bash");
		const homeDir = path.join(integrationRoot, "home");
		const systemBinDir = path.join(integrationRoot, "system-bin");
		const projectBinDir = path.join(homeDir, "project-bin");

		mkdirSync(integrationBinDir, { recursive: true });
		mkdirSync(integrationZshDir, { recursive: true });
		mkdirSync(integrationBashDir, { recursive: true });
		mkdirSync(homeDir, { recursive: true });
		mkdirSync(systemBinDir, { recursive: true });
		mkdirSync(projectBinDir, { recursive: true });

		const makeNode = (target: string, label: string) => {
			writeFileSync(
				target,
				`#!/usr/bin/env bash
echo ${label}
`,
			);
			chmodSync(target, 0o755);
		};

		makeNode(path.join(systemBinDir, "node"), "system");
		makeNode(path.join(projectBinDir, "node"), "project");

		writeFileSync(
			path.join(homeDir, ".zlogin"),
			`if [[ -f "$ZDOTDIR/.project-node" ]]; then
  export PATH="$HOME/project-bin:$PATH"
fi
`,
		);
		writeFileSync(path.join(homeDir, ".project-node"), "");

		createZshWrapper({
			BIN_DIR: integrationBinDir,
			ZSH_DIR: integrationZshDir,
			BASH_DIR: integrationBashDir,
		});

		const fixedWrapperPath = path.join(integrationZshDir, ".zlogin");
		const fixedWrapper = readFileSync(fixedWrapperPath, "utf-8");
		const legacyWrapper = fixedWrapper.replace(
			'export ZDOTDIR="$_superset_home"\nif [[ -o interactive ]]; then',
			"if [[ -o interactive ]]; then",
		);
		expect(legacyWrapper).not.toBe(fixedWrapper);

		const legacyWrapperPath = path.join(integrationZshDir, ".zlogin.legacy");
		writeFileSync(legacyWrapperPath, legacyWrapper);

		const runNode = (wrapperPath: string): string => {
			const output = execFileSync(
				"zsh",
				["-ic", `source "${wrapperPath}"; node`],
				{
					encoding: "utf-8",
					env: {
						HOME: homeDir,
						PATH: `${systemBinDir}:/usr/bin:/bin`,
						SUPERSET_ORIG_ZDOTDIR: homeDir,
						ZDOTDIR: integrationZshDir,
					},
				},
			).trim();

			const lines = output
				.split("\n")
				.map((line) => line.trim())
				.filter(Boolean);
			return lines[lines.length - 1] || "";
		};

		expect(runNode(legacyWrapperPath)).toBe("system");
		expect(runNode(fixedWrapperPath)).toBe("project");
	});

	it("creates bash wrapper with idempotent PATH prepend", () => {
		createBashWrapper(TEST_PATHS);

		const rcfile = readFileSync(path.join(TEST_BASH_DIR, "rcfile"), "utf-8");
		expect(rcfile).toContain("_superset_prepend_bin()");
		expect(rcfile).toContain(
			`export PATH=${quoteShellLiteral(TEST_BIN_DIR)}:"$PATH"`,
		);
		expect(rcfile).not.toContain(`claude() { "${TEST_BIN_DIR}/claude" "$@"; }`);
		expect(rcfile).toContain("hash -r 2>/dev/null || true");
	});

	it("uses login zsh command args when wrappers exist", () => {
		createZshWrapper(TEST_PATHS);

		const args = getCommandShellArgs("/bin/zsh", "echo ok", TEST_PATHS);
		expect(args[0]).toBe("-lc");
		expect(args[1]).toContain(
			`source ${quoteShellLiteral(path.join(TEST_ZSH_DIR, ".zshrc"))} &&`,
		);
		expect(args[1]).toContain(
			`_superset_wrapper=${quoteShellLiteral(path.join(TEST_BIN_DIR, "claude"))}`,
		);
		expect(args[1]).toContain('command claude "$@"');
		expect(args[1]).toContain("echo ok");
	});

	it("falls back to login shell args when zsh wrappers are missing", () => {
		const args = getCommandShellArgs("/bin/zsh", "echo ok", TEST_PATHS);
		expect(args[0]).toBe("-lc");
		expect(args[1]).not.toContain(
			`source ${quoteShellLiteral(path.join(TEST_ZSH_DIR, ".zshrc"))} &&`,
		);
		expect(args[1]).toContain(
			`_superset_wrapper=${quoteShellLiteral(path.join(TEST_BIN_DIR, "claude"))}`,
		);
		expect(args[1]).toContain('command claude "$@"');
		expect(args[1]).toContain("echo ok");
	});

	it("uses managed wrappers for non-interactive commands even if shell config rewrites PATH", () => {
		createBashWrapper(TEST_PATHS);

		const integrationRoot = path.join(TEST_ROOT, "managed-command-path");
		const homeDir = path.join(integrationRoot, "home");
		const systemBinDir = path.join(integrationRoot, "system-bin");
		mkdirSync(homeDir, { recursive: true });
		mkdirSync(systemBinDir, { recursive: true });

		writeFileSync(
			path.join(homeDir, ".bash_profile"),
			`export PATH="${systemBinDir}:/usr/bin:/bin"\n`,
		);

		writeFileSync(
			path.join(systemBinDir, "claude"),
			`#!/usr/bin/env bash
echo system
`,
		);
		chmodSync(path.join(systemBinDir, "claude"), 0o755);

		writeFileSync(
			path.join(TEST_BIN_DIR, "claude"),
			`#!/usr/bin/env bash
echo wrapper
`,
		);
		chmodSync(path.join(TEST_BIN_DIR, "claude"), 0o755);

		const args = getCommandShellArgs("/bin/bash", "claude", TEST_PATHS);
		const output = execFileSync("bash", args, {
			encoding: "utf-8",
			env: {
				...process.env,
				HOME: homeDir,
				PATH: `${systemBinDir}:/usr/bin:/bin`,
			},
		}).trim();
		expect(output).toBe("wrapper");
	});

	it("falls back to system binaries for managed commands when wrappers are missing", () => {
		const integrationRoot = path.join(TEST_ROOT, "managed-command-fallback");
		const homeDir = path.join(integrationRoot, "home");
		const systemBinDir = path.join(integrationRoot, "system-bin");
		const missingBinDir = path.join(integrationRoot, "missing-bin");
		mkdirSync(homeDir, { recursive: true });
		mkdirSync(systemBinDir, { recursive: true });

		writeFileSync(
			path.join(systemBinDir, "claude"),
			`#!/usr/bin/env bash
echo system
`,
		);
		chmodSync(path.join(systemBinDir, "claude"), 0o755);

		const fallbackPaths: ShellWrapperPaths = {
			BIN_DIR: missingBinDir,
			ZSH_DIR: TEST_ZSH_DIR,
			BASH_DIR: TEST_BASH_DIR,
		};
		createBashWrapper(fallbackPaths);

		const args = getCommandShellArgs("/bin/bash", "claude", fallbackPaths);
		const output = execFileSync("bash", args, {
			encoding: "utf-8",
			env: {
				...process.env,
				HOME: homeDir,
				PATH: `${systemBinDir}:/usr/bin:/bin`,
			},
		}).trim();
		expect(output).toBe("system");
	});

	it("falls back to system binaries when wrapper exists but is not executable", () => {
		const integrationRoot = path.join(
			TEST_ROOT,
			"managed-command-non-executable-fallback",
		);
		const homeDir = path.join(integrationRoot, "home");
		const systemBinDir = path.join(integrationRoot, "system-bin");
		const wrapperBinDir = path.join(integrationRoot, "wrapper-bin");
		mkdirSync(homeDir, { recursive: true });
		mkdirSync(systemBinDir, { recursive: true });
		mkdirSync(wrapperBinDir, { recursive: true });

		writeFileSync(
			path.join(systemBinDir, "claude"),
			`#!/usr/bin/env bash
echo system
`,
		);
		chmodSync(path.join(systemBinDir, "claude"), 0o755);

		writeFileSync(
			path.join(wrapperBinDir, "claude"),
			`#!/usr/bin/env bash
echo wrapper
`,
		);
		chmodSync(path.join(wrapperBinDir, "claude"), 0o644);

		const fallbackPaths: ShellWrapperPaths = {
			BIN_DIR: wrapperBinDir,
			ZSH_DIR: TEST_ZSH_DIR,
			BASH_DIR: TEST_BASH_DIR,
		};
		createBashWrapper(fallbackPaths);

		const args = getCommandShellArgs("/bin/bash", "claude", fallbackPaths);
		const output = execFileSync("bash", args, {
			encoding: "utf-8",
			env: {
				...process.env,
				HOME: homeDir,
				PATH: `${systemBinDir}:/usr/bin:/bin`,
			},
		}).trim();
		expect(output).toBe("system");
	});

	it("uses bash rcfile args for interactive bash shells", () => {
		expect(getShellArgs("/bin/bash", TEST_PATHS)).toEqual([
			"--rcfile",
			path.join(TEST_BASH_DIR, "rcfile"),
		]);
	});

	it("uses login args for other interactive shells", () => {
		expect(getShellArgs("/bin/zsh")).toEqual(["-l"]);
		expect(getShellArgs("/bin/sh")).toEqual(["-l"]);
		expect(getShellArgs("/bin/ksh")).toEqual(["-l"]);
	});

	it("returns empty args for unrecognized shells", () => {
		expect(getShellArgs("/bin/csh")).toEqual([]);
		expect(getShellArgs("powershell")).toEqual([]);
	});

	it("zsh BIN_DIR survives a late precmd PATH reset from user .zlogin", () => {
		if (!isZshAvailable()) return;

		const integrationRoot = path.join(TEST_ROOT, "mise-precmd-repro");
		const integrationBinDir = path.join(integrationRoot, "superset-bin");
		const integrationZshDir = path.join(integrationRoot, "zsh");
		const integrationBashDir = path.join(integrationRoot, "bash");
		const homeDir = path.join(integrationRoot, "home");
		const systemBinDir = path.join(integrationRoot, "system-bin");

		mkdirSync(integrationBinDir, { recursive: true });
		mkdirSync(integrationZshDir, { recursive: true });
		mkdirSync(integrationBashDir, { recursive: true });
		mkdirSync(homeDir, { recursive: true });
		mkdirSync(systemBinDir, { recursive: true });

		writeFileSync(
			path.join(systemBinDir, "claude"),
			"#!/usr/bin/env bash\necho system\n",
		);
		chmodSync(path.join(systemBinDir, "claude"), 0o755);

		writeFileSync(
			path.join(integrationBinDir, "claude"),
			"#!/usr/bin/env bash\necho wrapper\n",
		);
		chmodSync(path.join(integrationBinDir, "claude"), 0o755);

		// Simulate `mise activate zsh` from user .zlogin. In interactive login
		// shells, .zlogin runs after .zshrc and can register late precmd hooks.
		writeFileSync(
			path.join(homeDir, ".zlogin"),
			`_mise_hook_precmd() {
  export PATH="${systemBinDir}:/usr/bin:/bin"
}
precmd_functions+=(_mise_hook_precmd)
`,
		);

		createZshWrapper({
			BIN_DIR: integrationBinDir,
			ZSH_DIR: integrationZshDir,
			BASH_DIR: integrationBashDir,
		});

		// Start a real interactive login shell so startup order includes .zlogin.
		// Then run precmd hooks (simulating prompt rendering) and verify wrapper wins.
		const output = execFileSync(
			"zsh",
			[
				"-lic",
				'for fn in $precmd_functions; do "$fn" 2>/dev/null; done; type claude | head -1',
			],
			{
				encoding: "utf-8",
				env: {
					HOME: homeDir,
					PATH: `${systemBinDir}:/usr/bin:/bin`,
					SUPERSET_ORIG_ZDOTDIR: homeDir,
					ZDOTDIR: integrationZshDir,
				},
			},
		).trim();

		const lines = output
			.split("\n")
			.map((l) => l.trim())
			.filter(Boolean);
		const typeLine = lines[lines.length - 1] ?? "";
		expect(typeLine).toContain(integrationBinDir);
	});

	it("zsh wrappers treat special characters in generated paths literally", () => {
		if (!isZshAvailable()) return;

		const integrationRoot = path.join(TEST_ROOT, SPECIAL_SHELL_PATH_SEGMENT);
		const integrationBinDir = path.join(integrationRoot, "superset-bin");
		const integrationZshDir = path.join(integrationRoot, "zsh");
		const integrationBashDir = path.join(integrationRoot, "bash");
		const homeDir = path.join(integrationRoot, "home");

		mkdirSync(integrationBinDir, { recursive: true });
		mkdirSync(integrationZshDir, { recursive: true });
		mkdirSync(integrationBashDir, { recursive: true });
		mkdirSync(homeDir, { recursive: true });

		writeFileSync(
			path.join(integrationBinDir, "claude"),
			"#!/usr/bin/env bash\necho wrapper\n",
		);
		chmodSync(path.join(integrationBinDir, "claude"), 0o755);
		writeFileSync(path.join(homeDir, ".zshrc"), "\n");
		writeFileSync(path.join(homeDir, ".zlogin"), "\n");

		createZshWrapper({
			BIN_DIR: integrationBinDir,
			ZSH_DIR: integrationZshDir,
			BASH_DIR: integrationBashDir,
		});

		const output = execFileSync("zsh", ["-lic", "claude"], {
			encoding: "utf-8",
			env: {
				HOME: homeDir,
				PATH: "/usr/bin:/bin",
				SUPERSET_ORIG_ZDOTDIR: homeDir,
				ZDOTDIR: integrationZshDir,
			},
		}).trim();

		expect(output.trim()).toBe("wrapper");
	});

	it("zsh startup remains healthy when precmd_functions is readonly", () => {
		if (!isZshAvailable()) return;

		const integrationRoot = path.join(TEST_ROOT, "readonly-precmd-functions");
		const integrationBinDir = path.join(integrationRoot, "superset-bin");
		const integrationZshDir = path.join(integrationRoot, "zsh");
		const integrationBashDir = path.join(integrationRoot, "bash");
		const homeDir = path.join(integrationRoot, "home");

		mkdirSync(integrationBinDir, { recursive: true });
		mkdirSync(integrationZshDir, { recursive: true });
		mkdirSync(integrationBashDir, { recursive: true });
		mkdirSync(homeDir, { recursive: true });

		// A strict user config that could otherwise cause hook-registration
		// failures to terminate shell startup.
		writeFileSync(
			path.join(homeDir, ".zshrc"),
			`set -e
typeset -gr -a precmd_functions
`,
		);

		createZshWrapper({
			BIN_DIR: integrationBinDir,
			ZSH_DIR: integrationZshDir,
			BASH_DIR: integrationBashDir,
		});

		const output = execFileSync("zsh", ["-lic", "echo STARTUP_OK"], {
			encoding: "utf-8",
			env: {
				HOME: homeDir,
				PATH: "/usr/bin:/bin",
				SUPERSET_ORIG_ZDOTDIR: homeDir,
				ZDOTDIR: integrationZshDir,
			},
		}).trim();

		expect(output).toBe("STARTUP_OK");
	});

	it("bash managed commands treat special characters in wrapper paths literally", () => {
		const integrationRoot = path.join(TEST_ROOT, SPECIAL_SHELL_PATH_SEGMENT);
		const homeDir = path.join(integrationRoot, "home");
		const systemBinDir = path.join(integrationRoot, "system-bin");
		const specialPaths: ShellWrapperPaths = {
			BIN_DIR: path.join(integrationRoot, "bin"),
			ZSH_DIR: path.join(integrationRoot, "zsh"),
			BASH_DIR: path.join(integrationRoot, "bash"),
		};

		mkdirSync(homeDir, { recursive: true });
		mkdirSync(systemBinDir, { recursive: true });
		mkdirSync(specialPaths.BIN_DIR, { recursive: true });
		mkdirSync(specialPaths.BASH_DIR, { recursive: true });

		writeFileSync(
			path.join(systemBinDir, "claude"),
			`#!/usr/bin/env bash
echo system
`,
		);
		chmodSync(path.join(systemBinDir, "claude"), 0o755);

		writeFileSync(
			path.join(specialPaths.BIN_DIR, "claude"),
			`#!/usr/bin/env bash
echo wrapper
`,
		);
		chmodSync(path.join(specialPaths.BIN_DIR, "claude"), 0o755);

		createBashWrapper(specialPaths);

		const args = getCommandShellArgs("/bin/bash", "claude", specialPaths);
		const output = execFileSync("bash", args, {
			encoding: "utf-8",
			env: {
				...process.env,
				HOME: homeDir,
				PATH: `${systemBinDir}:/usr/bin:/bin`,
			},
		}).trim();

		expect(output).toBe("wrapper");
	});

	describe("SUPERSET_* env var protection from user RC overrides", () => {
		it("bash wrapper restores SUPERSET_WORKSPACE_NAME after user .bashrc overrides it", () => {
			const integrationRoot = path.join(TEST_ROOT, "bash-env-protect");
			const homeDir = path.join(integrationRoot, "home");
			mkdirSync(homeDir, { recursive: true });

			// User .bashrc overrides SUPERSET_WORKSPACE_NAME with corrupted value
			writeFileSync(
				path.join(homeDir, ".bashrc"),
				`export SUPERSET_WORKSPACE_NAME="user@host:~/path/to/worktree"\n`,
			);

			createBashWrapper(TEST_PATHS);

			const args = [
				"--rcfile",
				path.join(TEST_BASH_DIR, "rcfile"),
				"-ic",
				'echo "$SUPERSET_WORKSPACE_NAME"',
			];
			const output = execFileSync("bash", args, {
				encoding: "utf-8",
				env: {
					HOME: homeDir,
					PATH: "/usr/bin:/bin",
					SUPERSET_WORKSPACE_NAME: "my-clean-workspace",
				},
			}).trim();

			const lines = output
				.split("\n")
				.map((l) => l.trim())
				.filter(Boolean);
			expect(lines[lines.length - 1]).toBe("my-clean-workspace");
		});

		it("bash wrapper restores SUPERSET_WORKSPACE_NAME after user .bash_profile overrides it", () => {
			const integrationRoot = path.join(TEST_ROOT, "bash-profile-env-protect");
			const homeDir = path.join(integrationRoot, "home");
			mkdirSync(homeDir, { recursive: true });

			// User .bash_profile overrides SUPERSET_WORKSPACE_NAME
			writeFileSync(
				path.join(homeDir, ".bash_profile"),
				`export SUPERSET_WORKSPACE_NAME="$(whoami)@$(hostname):$(pwd)"\n`,
			);

			createBashWrapper(TEST_PATHS);

			const args = [
				"--rcfile",
				path.join(TEST_BASH_DIR, "rcfile"),
				"-ic",
				'echo "$SUPERSET_WORKSPACE_NAME"',
			];
			const output = execFileSync("bash", args, {
				encoding: "utf-8",
				env: {
					HOME: homeDir,
					PATH: "/usr/bin:/bin",
					SUPERSET_WORKSPACE_NAME: "correct-name",
				},
			}).trim();

			const lines = output
				.split("\n")
				.map((l) => l.trim())
				.filter(Boolean);
			expect(lines[lines.length - 1]).toBe("correct-name");
		});

		it("bash wrapper restores multiple SUPERSET_* vars after user RC overrides them", () => {
			const integrationRoot = path.join(TEST_ROOT, "bash-multi-env-protect");
			const homeDir = path.join(integrationRoot, "home");
			mkdirSync(homeDir, { recursive: true });

			writeFileSync(
				path.join(homeDir, ".bashrc"),
				`export SUPERSET_WORKSPACE_NAME="corrupted"
export SUPERSET_WORKSPACE_PATH="/wrong/path"
`,
			);

			createBashWrapper(TEST_PATHS);

			const args = [
				"--rcfile",
				path.join(TEST_BASH_DIR, "rcfile"),
				"-ic",
				'echo "$SUPERSET_WORKSPACE_NAME|$SUPERSET_WORKSPACE_PATH"',
			];
			const output = execFileSync("bash", args, {
				encoding: "utf-8",
				env: {
					HOME: homeDir,
					PATH: "/usr/bin:/bin",
					SUPERSET_WORKSPACE_NAME: "correct-name",
					SUPERSET_WORKSPACE_PATH: "/correct/path",
				},
			}).trim();

			const lines = output
				.split("\n")
				.map((l) => l.trim())
				.filter(Boolean);
			expect(lines[lines.length - 1]).toBe("correct-name|/correct/path");
		});

		it("zsh wrapper restores SUPERSET_WORKSPACE_NAME after user .zshrc overrides it", () => {
			if (!isZshAvailable()) return;

			const integrationRoot = path.join(TEST_ROOT, "zsh-env-protect");
			const integrationBinDir = path.join(integrationRoot, "superset-bin");
			const integrationZshDir = path.join(integrationRoot, "zsh");
			const integrationBashDir = path.join(integrationRoot, "bash");
			const homeDir = path.join(integrationRoot, "home");

			mkdirSync(integrationBinDir, { recursive: true });
			mkdirSync(integrationZshDir, { recursive: true });
			mkdirSync(integrationBashDir, { recursive: true });
			mkdirSync(homeDir, { recursive: true });

			// User .zshrc overrides SUPERSET_WORKSPACE_NAME with corrupted value
			writeFileSync(
				path.join(homeDir, ".zshrc"),
				`export SUPERSET_WORKSPACE_NAME="user@host:~/path/to/worktree"\n`,
			);

			createZshWrapper({
				BIN_DIR: integrationBinDir,
				ZSH_DIR: integrationZshDir,
				BASH_DIR: integrationBashDir,
			});

			const output = execFileSync(
				"zsh",
				["-lic", 'echo "$SUPERSET_WORKSPACE_NAME"'],
				{
					encoding: "utf-8",
					env: {
						HOME: homeDir,
						PATH: "/usr/bin:/bin",
						SUPERSET_ORIG_ZDOTDIR: homeDir,
						ZDOTDIR: integrationZshDir,
						SUPERSET_WORKSPACE_NAME: "my-clean-workspace",
					},
				},
			).trim();

			const lines = output
				.split("\n")
				.map((l) => l.trim())
				.filter(Boolean);
			expect(lines[lines.length - 1]).toBe("my-clean-workspace");
		});

		it("zsh wrapper restores SUPERSET_WORKSPACE_NAME after user .zlogin overrides it", () => {
			if (!isZshAvailable()) return;

			const integrationRoot = path.join(TEST_ROOT, "zsh-zlogin-env-protect");
			const integrationBinDir = path.join(integrationRoot, "superset-bin");
			const integrationZshDir = path.join(integrationRoot, "zsh");
			const integrationBashDir = path.join(integrationRoot, "bash");
			const homeDir = path.join(integrationRoot, "home");

			mkdirSync(integrationBinDir, { recursive: true });
			mkdirSync(integrationZshDir, { recursive: true });
			mkdirSync(integrationBashDir, { recursive: true });
			mkdirSync(homeDir, { recursive: true });

			writeFileSync(
				path.join(homeDir, ".zlogin"),
				`export SUPERSET_WORKSPACE_NAME="overridden-by-zlogin"\n`,
			);

			createZshWrapper({
				BIN_DIR: integrationBinDir,
				ZSH_DIR: integrationZshDir,
				BASH_DIR: integrationBashDir,
			});

			const output = execFileSync(
				"zsh",
				["-lic", 'echo "$SUPERSET_WORKSPACE_NAME"'],
				{
					encoding: "utf-8",
					env: {
						HOME: homeDir,
						PATH: "/usr/bin:/bin",
						SUPERSET_ORIG_ZDOTDIR: homeDir,
						ZDOTDIR: integrationZshDir,
						SUPERSET_WORKSPACE_NAME: "correct-name",
					},
				},
			).trim();

			const lines = output
				.split("\n")
				.map((l) => l.trim())
				.filter(Boolean);
			expect(lines[lines.length - 1]).toBe("correct-name");
		});
	});

	describe("fish shell", () => {
		it("uses fish-compatible managed command prelude for non-interactive commands", () => {
			const args = getCommandShellArgs(
				"/opt/homebrew/bin/fish",
				"echo ok",
				TEST_PATHS,
			);

			expect(args[0]).toBe("-lc");
			expect(args[1]).toContain(`function claude`);
			expect(args[1]).toContain(`command claude $argv`);
			expect(args[1]).not.toContain(`claude() {`);
			expect(args[1]).toContain("echo ok");
		});

		it("uses --init-command to prepend BIN_DIR to PATH for fish", () => {
			const args = getShellArgs("/opt/homebrew/bin/fish", TEST_PATHS);

			expect(args).toEqual([
				"-l",
				"--init-command",
				`set -l _superset_bin "${TEST_BIN_DIR}"; contains -- "$_superset_bin" $PATH; or set -gx PATH "$_superset_bin" $PATH`,
			]);
		});

		it("escapes fish init-command BIN_DIR safely", () => {
			const fishPath = '/tmp/with space/quote"buck$slash\\bin';
			const args = getShellArgs("/opt/homebrew/bin/fish", {
				...TEST_PATHS,
				BIN_DIR: fishPath,
			});

			expect(args).toEqual([
				"-l",
				"--init-command",
				`set -l _superset_bin "/tmp/with space/quote\\"buck\\$slash\\\\bin"; contains -- "$_superset_bin" $PATH; or set -gx PATH "$_superset_bin" $PATH`,
			]);
		});
	});
});
