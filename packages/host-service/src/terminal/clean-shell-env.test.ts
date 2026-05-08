import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { augmentPathForMacOS, buildMinimalEnv } from "./clean-shell-env.ts";

describe("buildMinimalEnv", () => {
	const trackedKeys = [
		"SSH_AUTH_SOCK",
		"SSH_AGENT_PID",
		"HOME",
		"PATH",
		"SHELL",
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
