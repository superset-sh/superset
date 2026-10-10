import { describe, expect, test } from "bun:test";
import { createEnvelope, type Envelope } from "@sentry/core";
import { DEFAULT_SAZABI_SENTRY_DSN, sazabiIntegration } from "./sentry-sazabi";

const SENTRY_DSN = "https://public@o1.ingest.sentry.io/1";
const CUSTOM_DSN = "https://key@example.intake.sazabi.com/0";

function fakeTransport(
	options: {
		send?: (envelope: Envelope) => PromiseLike<unknown>;
		flush?: (timeout?: number) => PromiseLike<boolean>;
	} = {},
) {
	const sent: Envelope[] = [];
	const flushes: (number | undefined)[] = [];
	return {
		sent,
		flushes,
		send(envelope: Envelope) {
			sent.push(envelope);
			return options.send
				? options.send(envelope)
				: Promise.resolve({ statusCode: 200 });
		},
		flush(timeout?: number) {
			flushes.push(timeout);
			return options.flush ? options.flush(timeout) : Promise.resolve(true);
		},
	};
}

function envelope(): Envelope {
	return createEnvelope<Envelope>(
		{ event_id: "abc", dsn: SENTRY_DSN, sent_at: "2026-01-01T00:00:00Z" },
		[[{ type: "event" }, { event_id: "abc", message: "boom" }]],
	);
}

function setup(
	sentry: ReturnType<typeof fakeTransport>,
	sazabi: ReturnType<typeof fakeTransport>,
	dsn?: string,
) {
	const urls: string[] = [];
	sazabiIntegration({
		dsn,
		transport: (options) => {
			urls.push(options.url);
			return sazabi as never;
		},
	}).setup({ getTransport: () => sentry as never });
	return { urls };
}

describe("sazabiIntegration", () => {
	test("Sentry receives the original envelope and its send result", async () => {
		const result = { statusCode: 202 };
		const sentry = fakeTransport({ send: () => Promise.resolve(result) });
		const sazabi = fakeTransport();
		setup(sentry, sazabi);

		const original = envelope();
		const returned = await (
			sentry.send as (e: Envelope) => PromiseLike<unknown>
		)(original);

		expect(returned).toBe(result);
		expect(sentry.sent).toHaveLength(1);
		expect(sentry.sent[0]).toBe(original);
		expect(original[0].dsn).toBe(SENTRY_DSN);
	});

	test("the copy carries the Sazabi DSN and the same items", async () => {
		const sentry = fakeTransport();
		const sazabi = fakeTransport();
		const { urls } = setup(sentry, sazabi, CUSTOM_DSN);

		const original = envelope();
		await sentry.send(original);

		expect(urls).toHaveLength(1);
		expect(urls[0]).toContain("example.intake.sazabi.com");
		expect(sazabi.sent).toHaveLength(1);
		const copy = sazabi.sent[0] as Envelope;
		expect(copy).not.toBe(original);
		expect(copy[0].dsn).toBe(CUSTOM_DSN);
		expect(copy[0].event_id).toBe("abc");
		expect(copy[1]).toBe(original[1]);
	});

	test("an unset or empty DSN falls back to the default", async () => {
		for (const dsn of [undefined, ""]) {
			const sentry = fakeTransport();
			const sazabi = fakeTransport();
			setup(sentry, sazabi, dsn);
			await sentry.send(envelope());
			expect((sazabi.sent[0] as Envelope)[0].dsn).toBe(
				DEFAULT_SAZABI_SENTRY_DSN,
			);
		}
	});

	test("a failing Sazabi send does not affect Sentry", async () => {
		const result = { statusCode: 200 };
		const sentry = fakeTransport({ send: () => Promise.resolve(result) });
		const sazabi = fakeTransport({
			send: () => Promise.reject(new Error("network down")),
		});
		setup(sentry, sazabi);

		await expect(sentry.send(envelope())).resolves.toBe(result);
		expect(sentry.sent).toHaveLength(1);
		// Let the rejected copy settle; an unhandled rejection would fail the run.
		await new Promise((resolve) => setTimeout(resolve, 0));
	});

	test("flush drains both transports and returns Sentry's result", async () => {
		const sentry = fakeTransport({ flush: () => Promise.resolve(false) });
		const sazabi = fakeTransport({ flush: () => Promise.resolve(true) });
		setup(sentry, sazabi);

		await expect(sentry.flush(500)).resolves.toBe(false);
		expect(sentry.flushes).toEqual([500]);
		expect(sazabi.flushes).toEqual([500]);
	});

	test("does nothing without a Sentry transport", () => {
		let created = false;
		sazabiIntegration({
			transport: () => {
				created = true;
				return fakeTransport() as never;
			},
		}).setup({ getTransport: () => undefined });
		expect(created).toBe(false);
	});
});
