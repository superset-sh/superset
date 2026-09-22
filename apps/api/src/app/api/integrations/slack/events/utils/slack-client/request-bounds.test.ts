import { describe, expect, test } from "bun:test";
import {
	deadlineRequestInterceptor,
	SLACK_REQUEST_TIMEOUT_MS,
	SlackDeadlineExceededError,
	slackRateLimitRetryAfterMs,
	slackRequestBounds,
} from "./request-bounds";

describe("slackRequestBounds", () => {
	const now = 1_000_000;
	test("caps every request and retries briefly when no deadline is given", () => {
		expect(slackRequestBounds(undefined, now)).toEqual({
			timeout: SLACK_REQUEST_TIMEOUT_MS,
			retries: 2,
		});
	});
	test("keeps the cap while the budget can absorb retries", () => {
		expect(slackRequestBounds(now + 240_000, now)).toEqual({
			timeout: SLACK_REQUEST_TIMEOUT_MS,
			retries: 2,
		});
	});
	test("drops retries once their backoff would not fit either", () => {
		expect(slackRequestBounds(now + 45_000, now).retries).toBe(0);
		expect(slackRequestBounds(now + 47_000, now).retries).toBe(2);
	});
	test("shrinks the cap and drops retries as the deadline nears", () => {
		expect(slackRequestBounds(now + 8_000, now)).toEqual({
			timeout: 8_000,
			retries: 0,
		});
	});
	test("never drops below a usable timeout once the budget is gone", () => {
		expect(slackRequestBounds(now - 1, now)).toEqual({
			timeout: 1_000,
			retries: 0,
		});
	});
});

describe("deadlineRequestInterceptor", () => {
	const start = 1_000_000;
	test("re-evaluates the timeout on every request as the budget drains", () => {
		let now = start;
		const intercept = deadlineRequestInterceptor(start + 100_000, () => now);
		expect(intercept({ timeout: 0 }).timeout).toBe(SLACK_REQUEST_TIMEOUT_MS);
		now = start + 95_000;
		expect(intercept({ timeout: 0 }).timeout).toBe(5_000);
	});
	test("refuses to start a request once the deadline has passed", () => {
		const intercept = deadlineRequestInterceptor(start, () => start + 1);
		expect(() => intercept({ timeout: 0 })).toThrow(SlackDeadlineExceededError);
	});
});

describe("slackRateLimitRetryAfterMs", () => {
	test("reads the SDK's rejected 429", () => {
		expect(
			slackRateLimitRetryAfterMs({
				code: "slack_webapi_rate_limited_error",
				retryAfter: 3,
			}),
		).toBe(3_000);
	});
	test("ignores every other error", () => {
		expect(slackRateLimitRetryAfterMs(new Error("boom"))).toBeUndefined();
		expect(slackRateLimitRetryAfterMs(null)).toBeUndefined();
	});
});
