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

describe("shell-wrappers", () => {
	beforeEach(() => {
		mkdirSync(TEST_BIN_DIR, { recursive: true });
		mkdirSync(TEST_ZSH_DIR, { recursive: true });
		mkdirSync(TEST_BASH_DIR, { recursive: true });
	});

	afterEach(() => {
		rmSync(TEST_ROOT, { recursive: true, force: true });
	});

	it("creates zsh wrappers with interactive .zlogin sourcing and command shims", () => {
		createZshWrapper(TEST_PATHS);

		const zshenv = readFileSync(path.join(TEST_ZSH_DIR, ".zshenv"), "utf-8");
		const zprofile = readFileSync(
			path.join(TEST_ZSH_DIR, ".zprofile"),
			"utf-8",
		);
		const zshrc = readFileSync(path.join(TEST_ZSH_DIR, ".zshrc"), "utf-8");
		const zlogin = readFileSync(path.join(TEST_ZSH_DIR, ".zlogin"), "utf-8");

		expect(zshenv).toContain('source "$_superset_home/.zshenv"');
		expect(zshenv).toContain(`export ZDOTDIR="${TEST_ZSH_DIR}"`);
		expect(zprofile).toContain('export ZDOTDIR="$_superset_home"');
		expect(zprofile).toContain('source "$_superset_home/.zprofile"');
		expect(zprofile).toContain(`export ZDOTDIR="${TEST_ZSH_DIR}"`);
		expect(zprofile.indexOf('export ZDOTDIR="$_superset_home"')).toBeLessThan(
			zprofile.indexOf('source "$_superset_home/.zprofile"'),
		);

		expect(zshrc).toContain("_superset_prepend_bin()");
		expect(zshrc).toContain(`claude() { "${TEST_BIN_DIR}/claude" "$@"; }`);
		expect(zshrc).toContain(`codex() { "${TEST_BIN_DIR}/codex" "$@"; }`);
		expect(zshrc).toContain(`opencode() { "${TEST_BIN_DIR}/opencode" "$@"; }`);
		expect(zshrc).toContain(`copilot() { "${TEST_BIN_DIR}/copilot" "$@"; }`);
		expect(zshrc).toContain(
			`mastracode() { "${TEST_BIN_DIR}/mastracode" "$@"; }`,
		);
		expect(zshrc).toContain("rehash 2>/dev/null || true");
		expect(zshrc).toContain('export ZDOTDIR="$_superset_home"');
		expect(zshrc).toContain('source "$_superset_home/.zshrc"');
		expect(zshrc.indexOf('export ZDOTDIR="$_superset_home"')).toBeLessThan(
			zshrc.indexOf('source "$_superset_home/.zshrc"'),
		);

		expect(zlogin).toContain("if [[ -o interactive ]]; then");
		expect(zlogin).toContain('export ZDOTDIR="$_superset_home"');
		expect(zlogin).toContain('source "$_superset_home/.zlogin"');
		expect(zlogin.indexOf('export ZDOTDIR="$_superset_home"')).toBeLessThan(
			zlogin.indexOf('source "$_superset_home/.zlogin"'),
		);
		expect(zlogin).toContain("_superset_prepend_bin()");
		expect(zlogin).toContain(`claude() { "${TEST_BIN_DIR}/claude" "$@"; }`);
		expect(zlogin).toContain(`copilot() { "${TEST_BIN_DIR}/copilot" "$@"; }`);
		expect(zlogin).toContain(
			`mastracode() { "${TEST_BIN_DIR}/mastracode" "$@"; }`,
		);
		expect(zlogin).toContain("rehash 2>/dev/null || true");
	});

	it("reproduces pre-fix .zlogin behavior where system node wins", () => {
		try {
			execFileSync("zsh", ["-lc", "exit 0"], { stdio: "ignore" });
		} catch (error) {
			const errorCode =
				typeof error === "object" &&
				error !== null &&
				"code" in error &&
				typeof error.code === "string"
					? error.code
					: "";
			if (errorCode === "ENOENT") {
				// zsh may not exist in all test environments.
				return;
			}
			throw error;
		}

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

	it("creates bash wrapper with command shims and idempotent PATH prepend", () => {
		createBashWrapper(TEST_PATHS);

		const rcfile = readFileSync(path.join(TEST_BASH_DIR, "rcfile"), "utf-8");
		expect(rcfile).toContain("_superset_prepend_bin()");
		expect(rcfile).toContain(`claude() { "${TEST_BIN_DIR}/claude" "$@"; }`);
		expect(rcfile).toContain(`codex() { "${TEST_BIN_DIR}/codex" "$@"; }`);
		expect(rcfile).toContain(`opencode() { "${TEST_BIN_DIR}/opencode" "$@"; }`);
		expect(rcfile).toContain(`copilot() { "${TEST_BIN_DIR}/copilot" "$@"; }`);
		expect(rcfile).toContain(
			`mastracode() { "${TEST_BIN_DIR}/mastracode" "$@"; }`,
		);
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
