import { describe, expect, test } from "bun:test";
import {
	GitHubReachabilityGate,
	GitHubUnreachableError,
	isGitHubUnreachableError,
} from "./github-reachability";

describe("isGitHubUnreachableError", () => {
	test("matches Node transport codes, including through a cause chain", () => {
		expect(
			isGitHubUnreachableError(
				Object.assign(new Error("x"), { code: "ENOTFOUND" }),
			),
		).toBe(true);
		const wrapped = new Error("request failed", {
			cause: Object.assign(new Error("getaddrinfo EAI_AGAIN api.github.com"), {
				code: "EAI_AGAIN",
			}),
		});
		expect(isGitHubUnreachableError(wrapped)).toBe(true);
	});

	test("matches gh's stderr phrasing and an execFile timeout kill", () => {
		expect(
			isGitHubUnreachableError(
				Object.assign(new Error("Command failed: gh api"), {
					stderr:
						"error connecting to api.github.com\ndial tcp: lookup api.github.com: no such host",
				}),
			),
		).toBe(true);
		expect(
			isGitHubUnreachableError(
				Object.assign(new Error("Command failed"), {
					killed: true,
					signal: "SIGTERM",
				}),
			),
		).toBe(true);
	});

	test("does not match answers from GitHub", () => {
		expect(
			isGitHubUnreachableError(
				Object.assign(new Error("Not Found"), { status: 404 }),
			),
		).toBe(false);
		expect(
			isGitHubUnreachableError(
				Object.assign(new Error("gh: HTTP 403: API rate limit exceeded"), {
					code: 1,
					stderr: "gh: API rate limit exceeded",
				}),
			),
		).toBe(false);
		expect(isGitHubUnreachableError("string")).toBe(false);
		expect(isGitHubUnreachableError(null)).toBe(false);
	});
});

describe("GitHubReachabilityGate", () => {
	const dns = () => Object.assign(new Error("x"), { code: "ENOTFOUND" });

	test("stays open until a transport failure, then holds with doubling windows", () => {
		let now = 1_000_000;
		const gate = new GitHubReachabilityGate({ now: () => now });
		expect(() => gate.assertReachable()).not.toThrow();

		expect(gate.recordFailure(dns())).toBe(60_000);
		expect(() => gate.assertReachable()).toThrow(GitHubUnreachableError);
		expect(gate.retryAfterMs()).toBe(60_000);

		now += 60_000;
		expect(() => gate.assertReachable()).not.toThrow();
		expect(gate.recordFailure(dns())).toBe(120_000);
		expect(gate.recordFailure(dns())).toBe(240_000);
	});

	test("caps the hold at 30 minutes", () => {
		const gate = new GitHubReachabilityGate({ now: () => 0 });
		let block = 0;
		for (let i = 0; i < 12; i++) block = gate.recordFailure(dns()) ?? 0;
		expect(block).toBe(30 * 60_000);
	});

	test("ignores answers from GitHub and resets on success", () => {
		let now = 0;
		const gate = new GitHubReachabilityGate({ now: () => now });
		expect(
			gate.recordFailure(
				Object.assign(new Error("Not Found"), { status: 404 }),
			),
		).toBeNull();
		expect(() => gate.assertReachable()).not.toThrow();

		gate.recordFailure(dns());
		gate.recordFailure(dns());
		gate.recordSuccess();
		expect(() => gate.assertReachable()).not.toThrow();
		// A fresh streak starts from the base window again.
		now = 10;
		expect(gate.recordFailure(dns())).toBe(60_000);
	});
});
