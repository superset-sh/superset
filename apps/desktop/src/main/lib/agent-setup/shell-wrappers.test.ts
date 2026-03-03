import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function isZshMissing(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		typeof error.code === "string" &&
		error.code === "ENOENT"
	);
}

function ensureZshAvailable(): boolean {
	try {
		execFileSync("zsh", ["-lc", "exit 0"], { stdio: "ignore" });
		return true;
	} catch (error) {
		if (isZshMissing(error)) {
			return false;
		}
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

	it("creates zsh wrappers that restore user ZDOTDIR and load integration", () => {
		createZshWrapper(TEST_PATHS);

		const zshenv = readFileSync(path.join(TEST_ZSH_DIR, ".zshenv"), "utf-8");
		const integration = readFileSync(
			path.join(TEST_ZSH_DIR, "superset-zsh-integration.zsh"),
			"utf-8",
		);
		const zprofile = readFileSync(
			path.join(TEST_ZSH_DIR, ".zprofile"),
			"utf-8",
		);
		const zshrc = readFileSync(path.join(TEST_ZSH_DIR, ".zshrc"), "utf-8");
		const zlogin = readFileSync(path.join(TEST_ZSH_DIR, ".zlogin"), "utf-8");

		expect(zshenv).toContain('export ZDOTDIR="$SUPERSET_ORIG_ZDOTDIR"');
		expect(zshenv).toContain('source -- "$_superset_file"');
		expect(zshenv).toContain("superset-zsh-integration.zsh");
		expect(integration).toContain("_superset_fix_path()");
		expect(integration).toContain(`local superset_bin="${TEST_BIN_DIR}"`);
		expect(integration).toContain("add-zsh-hook precmd _superset_fix_path");

		expect(zprofile).toContain('export ZDOTDIR="$SUPERSET_ORIG_ZDOTDIR"');
		expect(zprofile).toContain('source -- "$_superset_file"');
		expect(zshrc).toContain('export ZDOTDIR="$SUPERSET_ORIG_ZDOTDIR"');
		expect(zshrc).toContain('source -- "$_superset_file"');
		expect(zlogin).toContain('export ZDOTDIR="$SUPERSET_ORIG_ZDOTDIR"');
		expect(zlogin).toContain('source -- "$_superset_file"');
		expect(zshrc).not.toContain("claude() {");
		expect(zlogin).not.toContain("claude() {");
	});

	it("restores original ZDOTDIR before sourcing user .zshenv", () => {
		if (!ensureZshAvailable()) return;

		const integrationRoot = path.join(TEST_ROOT, "zdotdir-user-sees-original");
		const integrationZshDir = path.join(integrationRoot, "zsh");
		const integrationBashDir = path.join(integrationRoot, "bash");
		const integrationBinDir = path.join(integrationRoot, "bin");
		const userZdotdir = path.join(integrationRoot, "orig");
		const seenPath = path.join(integrationRoot, "seen.txt");

		mkdirSync(integrationBinDir, { recursive: true });
		mkdirSync(integrationZshDir, { recursive: true });
		mkdirSync(integrationBashDir, { recursive: true });
		mkdirSync(userZdotdir, { recursive: true });

		writeFileSync(
			path.join(userZdotdir, ".zshenv"),
			`echo "$ZDOTDIR" > "${seenPath}"
`,
		);

		createZshWrapper({
			BIN_DIR: integrationBinDir,
			ZSH_DIR: integrationZshDir,
			BASH_DIR: integrationBashDir,
		});

		execFileSync("zsh", ["-c", "true"], {
			env: {
				HOME: integrationRoot,
				PATH: process.env.PATH || "/usr/bin:/bin",
				SUPERSET_ORIG_ZDOTDIR: userZdotdir,
				SUPERSET_SHELL_INTEGRATION: "0",
				ZDOTDIR: integrationZshDir,
			},
		});

		const seen = readFileSync(seenPath, "utf-8").trim();
		expect(seen).toBe(userZdotdir);
	});

	it("preserves user ZDOTDIR override from .zshenv when sourcing .zshrc", () => {
		if (!ensureZshAvailable()) return;

		const integrationRoot = path.join(TEST_ROOT, "zdotdir-user-override");
		const integrationZshDir = path.join(integrationRoot, "zsh");
		const integrationBashDir = path.join(integrationRoot, "bash");
		const integrationBinDir = path.join(integrationRoot, "bin");
		const homeDir = path.join(integrationRoot, "home");
		const userZdotdir = path.join(integrationRoot, "orig");
		const altZdotdir = path.join(integrationRoot, "alt");
		const seenPath = path.join(integrationRoot, "sourced.txt");

		mkdirSync(integrationBinDir, { recursive: true });
		mkdirSync(integrationZshDir, { recursive: true });
		mkdirSync(integrationBashDir, { recursive: true });
		mkdirSync(homeDir, { recursive: true });
		mkdirSync(userZdotdir, { recursive: true });
		mkdirSync(altZdotdir, { recursive: true });

		writeFileSync(
			path.join(userZdotdir, ".zshenv"),
			`export ZDOTDIR="${altZdotdir}"
`,
		);
		writeFileSync(
			path.join(userZdotdir, ".zshrc"),
			`echo "orig" > "${seenPath}"
`,
		);
		writeFileSync(
			path.join(altZdotdir, ".zshrc"),
			`echo "alt" > "${seenPath}"
`,
		);

		createZshWrapper({
			BIN_DIR: integrationBinDir,
			ZSH_DIR: integrationZshDir,
			BASH_DIR: integrationBashDir,
		});

		execFileSync("zsh", ["-d", "-i", "-c", "true"], {
			env: {
				HOME: homeDir,
				PATH: process.env.PATH || "/usr/bin:/bin",
				SUPERSET_ORIG_ZDOTDIR: userZdotdir,
				SUPERSET_SHELL_INTEGRATION: "0",
				ZDOTDIR: integrationZshDir,
			},
		});

		const seen = readFileSync(seenPath, "utf-8").trim();
		expect(seen).toBe("alt");
	});

	it("creates bash wrapper with PATH integration and no command shims", () => {
		createBashWrapper(TEST_PATHS);

		const rcfile = readFileSync(path.join(TEST_BASH_DIR, "rcfile"), "utf-8");
		const integration = readFileSync(
			path.join(TEST_BASH_DIR, "superset-bash-integration.bash"),
			"utf-8",
		);
		expect(rcfile).toContain(
			`source "${path.join(TEST_BASH_DIR, "superset-bash-integration.bash")}"`,
		);
		expect(integration).toContain("_superset_fix_path()");
		expect(integration).toContain(`local superset_bin="${TEST_BIN_DIR}"`);
		expect(integration).not.toContain("claude() {");
		expect(rcfile).toContain("hash -r 2>/dev/null || true");
	});

	it("uses login zsh command args when wrappers exist", () => {
		createZshWrapper(TEST_PATHS);

		const args = getCommandShellArgs("/bin/zsh", "echo ok", TEST_PATHS);
		expect(args).toEqual([
			"-lc",
			`source "${path.join(TEST_ZSH_DIR, ".zshrc")}" && echo ok`,
		]);
	});

	it("falls back to login shell args when zsh wrappers are missing", () => {
		const args = getCommandShellArgs("/bin/zsh", "echo ok", TEST_PATHS);
		expect(args).toEqual(["-lc", "echo ok"]);
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

	describe("fish shell", () => {
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
