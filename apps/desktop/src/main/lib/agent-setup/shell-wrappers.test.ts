import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const TEST_ROOT = path.join(
	tmpdir(),
	`superset-shell-wrappers-${process.pid}-${Date.now()}`,
);
const TEST_BIN_DIR = path.join(TEST_ROOT, "bin");
const TEST_ZSH_DIR = path.join(TEST_ROOT, "zsh");
const TEST_BASH_DIR = path.join(TEST_ROOT, "bash");
const TEST_HOOKS_DIR = path.join(TEST_ROOT, "hooks");
const TEST_OPENCODE_CONFIG_DIR = path.join(TEST_HOOKS_DIR, "opencode");
const TEST_OPENCODE_PLUGIN_DIR = path.join(TEST_OPENCODE_CONFIG_DIR, "plugin");

mock.module("./paths", () => ({
	BIN_DIR: TEST_BIN_DIR,
	HOOKS_DIR: TEST_HOOKS_DIR,
	ZSH_DIR: TEST_ZSH_DIR,
	BASH_DIR: TEST_BASH_DIR,
	OPENCODE_CONFIG_DIR: TEST_OPENCODE_CONFIG_DIR,
	OPENCODE_PLUGIN_DIR: TEST_OPENCODE_PLUGIN_DIR,
}));

const { createBashWrapper, createZshWrapper, getCommandShellArgs } =
	await import("./shell-wrappers");

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
		createZshWrapper();

		const zshrc = readFileSync(path.join(TEST_ZSH_DIR, ".zshrc"), "utf-8");
		const zlogin = readFileSync(path.join(TEST_ZSH_DIR, ".zlogin"), "utf-8");

		expect(zshrc).toContain("_superset_prepend_bin()");
		expect(zshrc).toContain(`claude() { "${TEST_BIN_DIR}/claude" "$@"; }`);
		expect(zshrc).toContain(`codex() { "${TEST_BIN_DIR}/codex" "$@"; }`);
		expect(zshrc).toContain(`opencode() { "${TEST_BIN_DIR}/opencode" "$@"; }`);
		expect(zshrc).toContain(`copilot() { "${TEST_BIN_DIR}/copilot" "$@"; }`);
		expect(zshrc).toContain("rehash 2>/dev/null || true");

		expect(zlogin).toContain("if [[ -o interactive ]]; then");
		expect(zlogin).toContain('source "$_superset_home/.zlogin"');
		expect(zlogin).toContain("_superset_prepend_bin()");
		expect(zlogin).toContain(`claude() { "${TEST_BIN_DIR}/claude" "$@"; }`);
		expect(zlogin).toContain(`copilot() { "${TEST_BIN_DIR}/copilot" "$@"; }`);
		expect(zlogin).toContain("rehash 2>/dev/null || true");
	});

	it("creates bash wrapper with command shims and idempotent PATH prepend", () => {
		createBashWrapper();

		const rcfile = readFileSync(path.join(TEST_BASH_DIR, "rcfile"), "utf-8");
		expect(rcfile).toContain("_superset_prepend_bin()");
		expect(rcfile).toContain(`claude() { "${TEST_BIN_DIR}/claude" "$@"; }`);
		expect(rcfile).toContain(`codex() { "${TEST_BIN_DIR}/codex" "$@"; }`);
		expect(rcfile).toContain(`opencode() { "${TEST_BIN_DIR}/opencode" "$@"; }`);
		expect(rcfile).toContain(`copilot() { "${TEST_BIN_DIR}/copilot" "$@"; }`);
		expect(rcfile).toContain("hash -r 2>/dev/null || true");
	});

	it("uses login zsh command args when wrappers exist", () => {
		createZshWrapper();

		const args = getCommandShellArgs("/bin/zsh", "echo ok");
		expect(args).toEqual([
			"-lc",
			`source "${path.join(TEST_ZSH_DIR, ".zshrc")}" && echo ok`,
		]);
	});

	it("falls back to login shell args when zsh wrappers are missing", () => {
		const args = getCommandShellArgs("/bin/zsh", "echo ok");
		expect(args).toEqual(["-lc", "echo ok"]);
	});
});
