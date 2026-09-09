import { describe, expect, test } from "bun:test";
import {
	classifyGitHubHold,
	GitHubAvailabilityGate,
	GitHubUnavailableError,
	isGitHubUnreachableError,
} from "./github-availability";

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

	test("matches what gh 2.98 prints for a dead resolver and a refused proxy", () => {
		expect(
			isGitHubUnreachableError(
				Object.assign(new Error("Command failed: gh api repos/o/r/pulls"), {
					code: 1,
					stderr:
						"error connecting to github.invalid\ncheck your internet connection or https://githubstatus.com\n",
				}),
			),
		).toBe(true);
		expect(
			isGitHubUnreachableError(
				Object.assign(new Error("Command failed"), {
					code: 1,
					stderr:
						'Get "https://api.github.com/repos/o/r/pulls?state=open": proxyconnect tcp: dial tcp 127.0.0.1:1: connect: connection refused',
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

describe("GitHubAvailabilityGate", () => {
	const dns = () => Object.assign(new Error("x"), { code: "ENOTFOUND" });

	test("stays open until a transport failure, then holds with doubling windows", () => {
		let now = 1_000_000;
		const gate = new GitHubAvailabilityGate({ now: () => now });
		expect(() => gate.assertReachable()).not.toThrow();

		expect(gate.recordFailure(dns())?.holdMs).toBe(60_000);
		expect(() => gate.assertReachable()).toThrow(GitHubUnavailableError);
		expect(gate.retryAfterMs()).toBe(60_000);

		now += 60_000;
		expect(() => gate.assertReachable()).not.toThrow();
		expect(gate.recordFailure(dns())?.holdMs).toBe(120_000);
		now += 120_000;
		expect(gate.recordFailure(dns())?.holdMs).toBe(240_000);
	});

	test("failures that race an open hold neither extend it nor advance the streak", () => {
		let now = 1_000_000;
		const gate = new GitHubAvailabilityGate({ now: () => now });
		// A parallel sweep: nine lookups fail within the same second.
		expect(gate.recordFailure(dns())?.holdMs).toBe(60_000);
		for (let i = 0; i < 8; i++) {
			expect(gate.recordFailure(dns())).toEqual({
				reason: "unreachable",
				holdMs: 60_000,
				opened: false,
			});
		}
		expect(gate.status()?.until).toBe(now + 60_000);
		// The next real attempt after the window is the second strike.
		now += 60_000;
		expect(gate.recordFailure(dns())?.holdMs).toBe(120_000);
	});

	test("caps the hold at 30 minutes", () => {
		let now = 0;
		const gate = new GitHubAvailabilityGate({ now: () => now });
		let block = 0;
		for (let i = 0; i < 12; i++) {
			block = gate.recordFailure(dns())?.holdMs ?? 0;
			now += block;
		}
		expect(block).toBe(30 * 60_000);
	});

	test("ignores answers from GitHub and resets on success", () => {
		let now = 0;
		const gate = new GitHubAvailabilityGate({ now: () => now });
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
		expect(gate.recordFailure(dns())?.holdMs).toBe(60_000);
	});

	const rateLimited = (resetEpochSeconds?: number) =>
		Object.assign(
			new Error(
				"API rate limit exceeded for user ID 1. If you reach out to GitHub Support…",
			),
			{
				status: 403,
				response: resetEpochSeconds
					? { headers: { "x-ratelimit-reset": String(resetEpochSeconds) } }
					: undefined,
			},
		);

	test("holds a rate limit until GitHub's reported reset, plus slack", () => {
		const now = 1_700_000_000_000;
		const gate = new GitHubAvailabilityGate({ now: () => now });
		const hold = gate.recordFailure(rateLimited(1_700_000_000 + 600));
		expect(hold).toEqual({
			reason: "rate-limited",
			holdMs: 605_000,
			opened: true,
		});
		expect(gate.status()).toEqual({
			reason: "rate-limited",
			since: now,
			until: now + 605_000,
		});
		expect(() => gate.assertReachable()).toThrow(GitHubUnavailableError);
		try {
			gate.assertReachable();
		} catch (error) {
			expect((error as GitHubUnavailableError).reason).toBe("rate-limited");
		}
	});

	test("holds a rate limit with no reset for five minutes, capped at an hour", () => {
		let now = 1_700_000_000_000;
		const gate = new GitHubAvailabilityGate({ now: () => now });
		// gh prints the message without any header.
		expect(
			gate.recordFailure(
				Object.assign(new Error("Command failed: gh api"), {
					code: 1,
					stderr: "gh: API rate limit exceeded for user ID 1.",
				}),
			),
		).toEqual({ reason: "rate-limited", holdMs: 5 * 60_000, opened: true });
		now += 5 * 60_000;
		expect(
			gate.recordFailure(rateLimited(1_700_000_000 + 4 * 3600))?.holdMs,
		).toBe(65 * 60_000);
		// A reset already in the past is no reason to retry at full cadence.
		now += 65 * 60_000;
		expect(gate.recordFailure(rateLimited(1_700_000_000 - 60))?.holdMs).toBe(
			5 * 60_000,
		);
	});

	test("holds a rejected or missing credential with the unreachable backoff", () => {
		let now = 0;
		const gate = new GitHubAvailabilityGate({ now: () => now });
		expect(
			gate.recordFailure(
				Object.assign(new Error("Bad credentials"), { status: 401 }),
			),
		).toEqual({ reason: "auth", holdMs: 60_000, opened: true });
		now += 60_000;
		expect(
			gate.recordFailure(
				Object.assign(new Error("Command failed: gh api"), {
					stderr:
						"To get started with GitHub CLI, please run:  gh auth login\nAlternatively, populate the GH_TOKEN environment variable",
				}),
			),
		).toEqual({ reason: "auth", holdMs: 120_000, opened: true });
		now += 120_000;
		expect(
			gate.recordFailure(
				Object.assign(new Error("no token"), {
					cause: { kind: "NO_GITHUB_TOKEN" },
				}),
			),
		).toEqual({ reason: "auth", holdMs: 240_000, opened: true });
		expect(gate.status()?.reason).toBe("auth");
	});

	test("status is null once the hold expires or a call succeeds", () => {
		let now = 0;
		const gate = new GitHubAvailabilityGate({ now: () => now });
		expect(gate.status()).toBeNull();
		gate.recordFailure(rateLimited());
		expect(gate.status()?.reason).toBe("rate-limited");
		now += 5 * 60_000;
		expect(gate.status()).toBeNull();
		gate.recordFailure(rateLimited());
		gate.recordSuccess();
		expect(gate.status()).toBeNull();
	});

	test("classifies each host-wide failure and nothing else", () => {
		expect(classifyGitHubHold(dns())).toBe("unreachable");
		expect(classifyGitHubHold(rateLimited())).toBe("rate-limited");
		expect(
			classifyGitHubHold(
				Object.assign(new Error("Bad credentials"), { status: 401 }),
			),
		).toBe("auth");
		expect(
			classifyGitHubHold(
				Object.assign(new Error("Server Error"), { status: 500 }),
			),
		).toBeNull();
		expect(classifyGitHubHold(new Error("Validation Failed"))).toBeNull();
	});
});
