import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	augmentPathForMacOS,
	buildMinimalEnv,
	clearStrictShellEnvCache,
	getStrictShellEnvironment,
	parseEnvOutput,
} from "./clean-shell-env.ts";
import { __setAccountShellForTesting } from "./user-shell.ts";

describe("buildMinimalEnv", () => {
	const trackedKeys = [
		"SSH_AUTH_SOCK",
		"SSH_AGENT_PID",
		"HOME",
		"PATH",
		"SHELL",
		"DISPLAY",
		"XAUTHORITY",
		"WAYLAND_DISPLAY",
	];
	const original: Record<string, string | undefined> = {};

	beforeEach(() => {
		for (const key of trackedKeys) {
			original[key] = process.env[key];
		}
	});

	afterEach(() => {
		for (const key of trackedKeys) {
			if (original[key] === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = original[key];
			}
		}
	});

	test("propagates SSH_AUTH_SOCK so the bootstrap shell can see the SSH agent (#4238)", () => {
		process.env.SSH_AUTH_SOCK = "/private/tmp/com.apple.launchd.abc/Listeners";
		const env = buildMinimalEnv();
		expect(env.SSH_AUTH_SOCK).toBe(
			"/private/tmp/com.apple.launchd.abc/Listeners",
		);
	});

	test("propagates SSH_AGENT_PID so ssh-agent's PID survives the bootstrap shell", () => {
		process.env.SSH_AGENT_PID = "12345";
		const env = buildMinimalEnv();
		expect(env.SSH_AGENT_PID).toBe("12345");
	});

	test("propagates DISPLAY and XAUTHORITY so X11 clipboard reads work (#5003)", () => {
		process.env.DISPLAY = ":0";
		process.env.XAUTHORITY = "/tmp/xauth_abc123";
		const env = buildMinimalEnv();
		expect(env.DISPLAY).toBe(":0");
		expect(env.XAUTHORITY).toBe("/tmp/xauth_abc123");
	});

	test("propagates WAYLAND_DISPLAY so Wayland clipboard reads work (#5003)", () => {
		process.env.WAYLAND_DISPLAY = "wayland-0";
		const env = buildMinimalEnv();
		expect(env.WAYLAND_DISPLAY).toBe("wayland-0");
	});
});

describe("augmentPathForMacOS", () => {
	test("prepends Homebrew paths on darwin without duplicating existing entries", () => {
		const env: Record<string, string> = { PATH: "/opt/homebrew/bin:/usr/bin" };
		augmentPathForMacOS(env, "darwin");
		expect(env.PATH).toBe(
			"/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin:/opt/homebrew/bin:/usr/bin",
		);
	});

	test("is a no-op on non-darwin", () => {
		const env: Record<string, string> = { PATH: "/usr/bin" };
		augmentPathForMacOS(env, "linux");
		expect(env.PATH).toBe("/usr/bin");
	});
});

const DELIMITER = "__SUPERSET_SHELL_ENV__";

function withDelimiters(body: string): string {
	return `${DELIMITER}\n${body}\n${DELIMITER}`;
}

describe("parseEnvOutput", () => {
	test("parses standard KEY=value lines", () => {
		const result = parseEnvOutput(
			withDelimiters("HOME=/Users/test\nPATH=/usr/bin\nSHELL=/bin/zsh"),
		);
		expect(result).toEqual({
			HOME: "/Users/test",
			PATH: "/usr/bin",
			SHELL: "/bin/zsh",
		});
	});

	test("drops exported bash function definitions (BASH_FUNC_*)", () => {
		const body = [
			"HOME=/home/ec2-user",
			"BASH_FUNC_which%%=() {  (alias; eval declare -f) | /usr/bin/which --tty-only --read-alias --read-functions --show-tilde --show-dot $@",
			"}",
			"PATH=/usr/local/bin:/usr/bin",
		].join("\n");
		const result = parseEnvOutput(withDelimiters(body));
		expect(result).toEqual({
			HOME: "/home/ec2-user",
			PATH: "/usr/local/bin:/usr/bin",
		});
		expect(Object.keys(result)).not.toContain("BASH_FUNC_which%%");
	});

	test("ignores continuation lines that contain '='", () => {
		const body = [
			"HOME=/home/x",
			"BASH_FUNC_foo%%=() {  local x=1",
			"  local y=2",
			"}",
			"USER=x",
		].join("\n");
		const result = parseEnvOutput(withDelimiters(body));
		expect(result).toEqual({ HOME: "/home/x", USER: "x" });
	});

	test("throws when delimiter is missing", () => {
		expect(() => parseEnvOutput("HOME=/x")).toThrow("delimiter not found");
	});

	test("throws when section parses to empty", () => {
		expect(() => parseEnvOutput(withDelimiters(""))).toThrow("returned empty");
	});
});

// Real shell, real pipes: a daemon started from the rc file inherits the
// shell's stdout/stderr and outlives it. Resolution must complete when the
// shell exits, not when that daemon lets go of the pipes, and must not leave
// the pipe read ends in this process's descriptor table (HOST-SERVICE-4E).
// Needs the real zsh and perl binaries; a CI image without them (Linux
// runners ship no zsh) cannot exercise the pipe-holding daemon at all.
const canRunRealShell =
	process.platform !== "win32" &&
	existsSync("/bin/zsh") &&
	existsSync("/usr/bin/perl");

describe.skipIf(!canRunRealShell)(
	"getStrictShellEnvironment with an rc-spawned daemon holding the pipes",
	() => {
		let home: string;
		let originalHome: string | undefined;
		const openDescriptors = () =>
			readdirSync(process.platform === "linux" ? "/proc/self/fd" : "/dev/fd")
				.length;

		beforeEach(() => {
			home = mkdtempSync(join(tmpdir(), "clean-shell-env-"));
			// New session so the timeout's tree kill cannot reach it, like a
			// daemon that detached itself would be.
			writeFileSync(
				join(home, ".zshrc"),
				`/usr/bin/perl -e 'use POSIX; POSIX::setsid(); sleep 30' &\necho $! > "${home}/holder.pid"\n`,
			);
			originalHome = process.env.HOME;
			process.env.HOME = home;
			__setAccountShellForTesting("/bin/zsh");
			clearStrictShellEnvCache();
		});

		afterEach(() => {
			__setAccountShellForTesting(undefined);
			if (originalHome === undefined) delete process.env.HOME;
			else process.env.HOME = originalHome;
			try {
				process.kill(Number(readFileSync(join(home, "holder.pid"), "utf8")));
			} catch {}
			rmSync(home, { recursive: true, force: true });
			clearStrictShellEnvCache();
		});

		test("resolves on shell exit and releases both pipe descriptors", async () => {
			const before = openDescriptors();
			const startedAt = Date.now();
			const env = await getStrictShellEnvironment();
			expect(env.HOME).toBe(home);
			expect(Date.now() - startedAt).toBeLessThan(5_000);
			// The holder is still alive with the write ends; ours are gone.
			await new Promise((resolve) => setTimeout(resolve, 200));
			expect(openDescriptors()).toBe(before);
		}, 15_000);
	},
);
