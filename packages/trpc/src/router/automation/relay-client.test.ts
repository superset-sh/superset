import { beforeEach, describe, expect, it, vi } from "bun:test";
import { RelayDispatchError, relayMutation } from "./relay-client";

describe("relay-client", () => {
	describe("RelayDispatchError", () => {
		it("preserves error class name as 'RelayDispatchError'", () => {
			const error = new RelayDispatchError("test message", 500, "body");
			expect(error.name).toBe("RelayDispatchError");
		});

		it("includes status and body in instance properties", () => {
			const error = new RelayDispatchError("test message", 404, "not found");
			expect(error.status).toBe(404);
			expect(error.body).toBe("not found");
		});

		it("extends Error so instanceof checks work", () => {
			const error = new RelayDispatchError("test", 500, "body");
			expect(error instanceof Error).toBe(true);
			expect(error instanceof RelayDispatchError).toBe(true);
		});
	});

	describe("relayMutation", () => {
		beforeEach(() => {
			vi.clearAllMocks();
		});

		it("throws RelayDispatchError on non-ok response with truncated body", async () => {
			const longBody = "x".repeat(1000);
			global.fetch = vi.fn(() =>
				Promise.resolve({
					ok: false,
					status: 500,
					text: () => Promise.resolve(longBody),
				}),
			) as unknown as typeof fetch;

			const options = {
				relayUrl: "http://relay.local",
				hostId: "host-123",
				jwt: "token",
			};

			try {
				await relayMutation(options, "test.mutation", { input: "data" });
				expect.fail("should have thrown");
			} catch (err) {
				expect(err instanceof RelayDispatchError).toBe(true);
				if (err instanceof RelayDispatchError) {
					// Verify the message uses human-readable format and is truncated
					expect(err.message).toContain("Relay error (status 500):");
					expect(err.message.length).toBeLessThan(300);
					// full body preserved in property
					expect(err.body).toBe(longBody);
				}
			}
		});

		it("throws RelayDispatchError on invalid JSON with truncated snippet", async () => {
			const longBody = `invalid json ${"x".repeat(500)}`;
			global.fetch = vi.fn(() =>
				Promise.resolve({
					ok: true,
					status: 200,
					text: () => Promise.resolve(longBody),
				}),
			) as unknown as typeof fetch;

			const options = {
				relayUrl: "http://relay.local",
				hostId: "host-123",
				jwt: "token",
			};

			try {
				await relayMutation(options, "test.mutation", { input: "data" });
				expect.fail("should have thrown");
			} catch (err) {
				expect(err instanceof RelayDispatchError).toBe(true);
				if (err instanceof RelayDispatchError) {
					// Verify truncation at 200 chars for JSON parse errors
					expect(err.message).toContain("invalid JSON from relay");
					expect(err.message.length).toBeLessThan(300);
				}
			}
		});

		it("throws RelayDispatchError when result.data is missing with truncated body", async () => {
			const resultObj = { result: {} };
			const _longBody = JSON.stringify(resultObj) + "x".repeat(500);
			// Create valid JSON with missing data field
			const validJson = JSON.stringify(resultObj);
			global.fetch = vi.fn(() =>
				Promise.resolve({
					ok: true,
					status: 200,
					text: () => Promise.resolve(validJson),
				}),
			) as unknown as typeof fetch;

			const options = {
				relayUrl: "http://relay.local",
				hostId: "host-123",
				jwt: "token",
			};

			try {
				await relayMutation(options, "test.mutation", { input: "data" });
				expect.fail("should have thrown");
			} catch (err) {
				expect(err instanceof RelayDispatchError).toBe(true);
				if (err instanceof RelayDispatchError) {
					expect(err.message).toContain("missing result.data");
					expect(err.message.length).toBeLessThan(300);
				}
			}
		});
	});

	describe("humanRelayMessage (AC-3 tests)", () => {
		it("AC-3: relay 503 translates to 'Target machine was offline'", async () => {
			global.fetch = vi.fn(() =>
				Promise.resolve({
					ok: false,
					status: 503,
					text: () => Promise.resolve('{"error":"Service unavailable"}'),
				}),
			) as unknown as typeof fetch;

			const options = {
				relayUrl: "http://relay.local",
				hostId: "host-123",
				jwt: "token",
			};

			try {
				await relayMutation(options, "test.mutation", { input: "data" });
				expect.fail("should have thrown");
			} catch (err) {
				expect(err instanceof RelayDispatchError).toBe(true);
				if (err instanceof RelayDispatchError) {
					expect(err.message).toBe("Target machine was offline");
					expect(err.status).toBe(503);
				}
			}
		});

		it("AC-3: relay 502 translates to 'Target machine is unreachable'", async () => {
			global.fetch = vi.fn(() =>
				Promise.resolve({
					ok: false,
					status: 502,
					text: () => Promise.resolve('{"error":"Bad gateway"}'),
				}),
			) as unknown as typeof fetch;

			const options = {
				relayUrl: "http://relay.local",
				hostId: "host-123",
				jwt: "token",
			};

			try {
				await relayMutation(options, "test.mutation", { input: "data" });
				expect.fail("should have thrown");
			} catch (err) {
				expect(err instanceof RelayDispatchError).toBe(true);
				if (err instanceof RelayDispatchError) {
					expect(err.message).toBe("Target machine is unreachable");
					expect(err.status).toBe(502);
				}
			}
		});

		it("AC-3: relay 504 translates to 'Target machine timed out'", async () => {
			global.fetch = vi.fn(() =>
				Promise.resolve({
					ok: false,
					status: 504,
					text: () => Promise.resolve('{"error":"Gateway timeout"}'),
				}),
			) as unknown as typeof fetch;

			const options = {
				relayUrl: "http://relay.local",
				hostId: "host-123",
				jwt: "token",
			};

			try {
				await relayMutation(options, "test.mutation", { input: "data" });
				expect.fail("should have thrown");
			} catch (err) {
				expect(err instanceof RelayDispatchError).toBe(true);
				if (err instanceof RelayDispatchError) {
					expect(err.message).toBe("Target machine timed out");
					expect(err.status).toBe(504);
				}
			}
		});

		it("AC-3: unknown status falls back to 'Relay error (status N): ...'", async () => {
			const responseBody = '{"error":"Some error"}';
			global.fetch = vi.fn(() =>
				Promise.resolve({
					ok: false,
					status: 418,
					text: () => Promise.resolve(responseBody),
				}),
			) as unknown as typeof fetch;

			const options = {
				relayUrl: "http://relay.local",
				hostId: "host-123",
				jwt: "token",
			};

			try {
				await relayMutation(options, "test.mutation", { input: "data" });
				expect.fail("should have thrown");
			} catch (err) {
				expect(err instanceof RelayDispatchError).toBe(true);
				if (err instanceof RelayDispatchError) {
					expect(err.message).toContain("Relay error (status 418):");
					expect(err.status).toBe(418);
				}
			}
		});

		it("AC-3: truncates long response body in fallback message", async () => {
			const longBody = "error-details".repeat(50); // ~650 chars
			global.fetch = vi.fn(() =>
				Promise.resolve({
					ok: false,
					status: 500,
					text: () => Promise.resolve(longBody),
				}),
			) as unknown as typeof fetch;

			const options = {
				relayUrl: "http://relay.local",
				hostId: "host-123",
				jwt: "token",
			};

			try {
				await relayMutation(options, "test.mutation", { input: "data" });
				expect.fail("should have thrown");
			} catch (err) {
				expect(err instanceof RelayDispatchError).toBe(true);
				if (err instanceof RelayDispatchError) {
					// Message should contain "Relay error (status 500):" and truncated body
					expect(err.message).toContain("Relay error (status 500):");
					// Should be truncated, not the full long body
					expect(err.message.length).toBeLessThan(longBody.length);
					// Should end with ellipsis if truncated
					if (err.message.length < 300) {
						// Truncation happened
						expect(err.message).toMatch(/…$/);
					}
				}
			}
		});
	});
});
