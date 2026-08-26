import { describe, expect, mock, test } from "bun:test";
import { DrizzleQueryError } from "drizzle-orm";

const execute = mock(
	async (_query: unknown): Promise<{ rows: unknown[] }> => ({
		rows: [],
	}),
);

mock.module("@superset/db/client", () => ({
	db: { execute },
	dbWs: { execute },
}));

const { recordWebhookDelivery } = await import("./recordWebhookDelivery");

/** Invented, not captured: stands in for a third party's webhook body. */
const WEBHOOK_BODY = {
	action: "opened",
	repository: { full_name: "example-org/example-repo", private: true },
	pull_request: {
		number: 7,
		head: { ref: "example/topic-branch" },
		title: "Example pull request",
		body: "free text authored by someone who is not our user: leaked-body-marker",
	},
};
const BODY_MARKER = "leaked-body-marker";

/**
 * Everything the error tracker reads off a thrown error: the message, the
 * stack, every own property, and the same again for each link of the `cause`
 * chain, which Sentry's linkedErrors integration follows by default.
 */
function whatTheReporterSees(error: unknown): string {
	const parts: string[] = [];
	let current: unknown = error;
	for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
		parts.push(
			current.name,
			current.message,
			current.stack ?? "",
			JSON.stringify(current, Object.getOwnPropertyNames(current)) ?? "",
		);
		current = current.cause;
	}
	return parts.join("\n");
}

function drizzleFailure(): DrizzleQueryError {
	return new DrizzleQueryError(
		"WITH event AS (INSERT INTO ingest.webhook_events ... VALUES ($1, $2, $3, 'pending') ...), body AS (INSERT INTO ingest.webhook_payloads ... $4::jsonb ...) SELECT id, status, retry_count, received_at FROM event",
		["github", "delivery-1", "pull_request", JSON.stringify(WEBHOOK_BODY)],
		new Error("Error connecting to database: TypeError: fetch failed"),
	);
}

describe("recordWebhookDelivery", () => {
	test("a failed write does not report the webhook body", async () => {
		execute.mockImplementationOnce(() => Promise.reject(drizzleFailure()));

		const thrown = await recordWebhookDelivery({
			provider: "github",
			eventId: "delivery-1",
			eventType: "pull_request",
			payload: WEBHOOK_BODY,
		}).then(
			() => undefined,
			(error: unknown) => error,
		);

		expect(thrown).toBeInstanceOf(Error);
		expect(whatTheReporterSees(thrown)).not.toContain(BODY_MARKER);
		expect(whatTheReporterSees(thrown)).not.toContain("example-org");
	});

	test("a failed write still names the operation, provider and reason", async () => {
		const failure = drizzleFailure();
		execute.mockImplementationOnce(() => Promise.reject(failure));

		const thrown = await recordWebhookDelivery({
			provider: "github",
			eventId: "delivery-1",
			eventType: "pull_request",
			payload: WEBHOOK_BODY,
		}).then(
			() => undefined,
			(error: unknown) => error,
		);

		const message = (thrown as Error).message;
		expect(message).toContain("recordWebhookDelivery");
		expect(message).toContain("ingest.webhook_events");
		expect(message).toContain("github");
		expect(message).toContain(
			"Error connecting to database: TypeError: fetch failed",
		);
		// The driver error must survive as `cause`: it carries the code and
		// stack the report needs, and the message assertions above would still
		// pass if a later change dropped it.
		expect((thrown as Error).cause).toBe(failure.cause);
	});

	// Guards the matcher: only the wrapper that carries bind parameters is
	// rewritten. Anything else propagates exactly as it did before.
	test("an error that carries no bind parameters propagates untouched", async () => {
		const original = new Error("boom");
		execute.mockImplementationOnce(() => Promise.reject(original));

		const thrown = await recordWebhookDelivery({
			provider: "linear",
			eventId: "delivery-2",
			eventType: "Issue",
			payload: WEBHOOK_BODY,
		}).then(
			() => undefined,
			(error: unknown) => error,
		);

		expect(thrown).toBe(original);
		expect((thrown as Error).message).toBe("boom");
	});

	test("a successful write still returns the recorded delivery", async () => {
		execute.mockImplementationOnce(() =>
			Promise.resolve({
				rows: [
					{
						id: "event-1",
						status: "pending",
						retry_count: 0,
						received_at: "2026-08-22 12:00:00",
					},
				],
			}),
		);

		const recorded = await recordWebhookDelivery({
			provider: "github",
			eventId: "delivery-3",
			eventType: "push",
			payload: WEBHOOK_BODY,
		});

		expect(recorded).toEqual({
			id: "event-1",
			status: "pending",
			retryCount: 0,
			receivedAt: new Date("2026-08-22T12:00:00Z"),
		});
	});
});
