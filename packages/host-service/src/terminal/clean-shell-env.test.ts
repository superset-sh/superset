import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	augmentPathForMacOS,
	buildBootstrapEnv,
	parseEnvOutput,
} from "./clean-shell-env.ts";

describe("buildBootstrapEnv", () => {
	// Snapshot any process.env keys the tests mutate so they can be restored.
	const trackedKeys = [
		"SSH_AUTH_SOCK",
		"SSH_AGENT_PID",
		"HOME",
		"PATH",
		"SHELL",
		"DD_API_KEY",
		"DD_APP_KEY",
		"OPENAI_API_KEY",
		"GITHUB_TOKEN",
		"HOST_SERVICE_SECRET",
		"AUTH_TOKEN",
		"ORGANIZATION_ID",
		"ELECTRON_RUN_AS_NODE",
		"NODE_ENV",
		"npm_lifecycle_event",
		"VITE_API_URL",
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
		const env = buildBootstrapEnv();
		expect(env.SSH_AUTH_SOCK).toBe(
			"/private/tmp/com.apple.launchd.abc/Listeners",
		);
	});

	test("propagates SSH_AGENT_PID so ssh-agent's PID survives the bootstrap shell", () => {
		process.env.SSH_AGENT_PID = "12345";
		const env = buildBootstrapEnv();
		expect(env.SSH_AGENT_PID).toBe("12345");
	});

	test("forwards launchctl-injected creds (DD_API_KEY) into the snapshot shell — the original v2 datadog-MCP bug", () => {
		process.env.DD_API_KEY = "dd-launchctl-value";
		process.env.DD_APP_KEY = "dd-app-launchctl-value";
		const env = buildBootstrapEnv();
		expect(env.DD_API_KEY).toBe("dd-launchctl-value");
		expect(env.DD_APP_KEY).toBe("dd-app-launchctl-value");
	});

	test("forwards arbitrary user-set credentials, no allowlist gating", () => {
		process.env.OPENAI_API_KEY = "sk-user-key";
		process.env.GITHUB_TOKEN = "gh-pat-xyz";
		const env = buildBootstrapEnv();
		expect(env.OPENAI_API_KEY).toBe("sk-user-key");
		expect(env.GITHUB_TOKEN).toBe("gh-pat-xyz");
	});

	test("strips desktop-injected host-service runtime keys before the shell sees them", () => {
		process.env.HOST_SERVICE_SECRET = "secret";
		process.env.AUTH_TOKEN = "bearer";
		process.env.ORGANIZATION_ID = "org-abc";
		process.env.ELECTRON_RUN_AS_NODE = "1";
		process.env.NODE_ENV = "production";
		process.env.npm_lifecycle_event = "dev";
		process.env.VITE_API_URL = "http://localhost:3000";
		const env = buildBootstrapEnv();
		expect(env.HOST_SERVICE_SECRET).toBeUndefined();
		expect(env.AUTH_TOKEN).toBeUndefined();
		expect(env.ORGANIZATION_ID).toBeUndefined();
		expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
		expect(env.NODE_ENV).toBeUndefined();
		expect(env.npm_lifecycle_event).toBeUndefined();
		expect(env.VITE_API_URL).toBeUndefined();
	});

	test("sets the bootstrap toggles regardless of host-service process.env", () => {
		const env = buildBootstrapEnv();
		expect(env.DISABLE_AUTO_UPDATE).toBe("true");
		expect(env.ZSH_TMUX_AUTOSTARTED).toBe("true");
		expect(env.ZSH_TMUX_AUTOSTART).toBe("false");
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
