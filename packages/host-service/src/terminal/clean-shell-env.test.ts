import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { augmentPathForMacOS, buildMinimalEnv } from "./clean-shell-env.ts";

describe("buildMinimalEnv", () => {
	const trackedKeys = [
		"SSH_AUTH_SOCK",
		"SSH_AGENT_PID",
		"HOME",
		"PATH",
		"SHELL",
		"HTTP_PROXY",
		"HTTPS_PROXY",
		"NO_PROXY",
		"http_proxy",
		"NODE_EXTRA_CA_CERTS",
		"SSL_CERT_FILE",
		"TZ",
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

	test("propagates launchd-injected proxy + CA + TZ vars (rc files won't recreate them)", () => {
		process.env.HTTP_PROXY = "http://corp-proxy:3128";
		process.env.HTTPS_PROXY = "http://corp-proxy:3128";
		process.env.NO_PROXY = "localhost,127.0.0.1";
		process.env.http_proxy = "http://corp-proxy:3128";
		process.env.NODE_EXTRA_CA_CERTS = "/etc/ssl/corp-ca.pem";
		process.env.SSL_CERT_FILE = "/etc/ssl/corp-ca.pem";
		process.env.TZ = "America/Los_Angeles";

		const env = buildMinimalEnv();

		expect(env.HTTP_PROXY).toBe("http://corp-proxy:3128");
		expect(env.HTTPS_PROXY).toBe("http://corp-proxy:3128");
		expect(env.NO_PROXY).toBe("localhost,127.0.0.1");
		expect(env.http_proxy).toBe("http://corp-proxy:3128");
		expect(env.NODE_EXTRA_CA_CERTS).toBe("/etc/ssl/corp-ca.pem");
		expect(env.SSL_CERT_FILE).toBe("/etc/ssl/corp-ca.pem");
		expect(env.TZ).toBe("America/Los_Angeles");
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
