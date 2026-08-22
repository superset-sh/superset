import { describe, expect, test } from "bun:test";
import { TRPCClientError } from "@trpc/client";
import { TRPCError } from "@trpc/server";
import { rethrowCloudUnreachable } from "./cloud-api-error";

function capture(error: unknown): TRPCError | null {
	try {
		rethrowCloudUnreachable(error);
		return null;
	} catch (thrown) {
		return thrown as TRPCError;
	}
}

/**
 * The shape a tRPC client produces when fetch never completes: the client
 * error's message is always the useless "fetch failed", the undici TypeError
 * carries no code, and the real signal sits one more level down.
 */
function transportFailure(cause: Error): unknown {
	return TRPCClientError.from(new TypeError("fetch failed", { cause }));
}

function codedError(message: string, code: string): Error {
	return Object.assign(new Error(message), { code });
}

describe("rethrowCloudUnreachable", () => {
	test("read timeout on an established socket (HOST-SERVICE-1B)", () => {
		const thrown = capture(
			transportFailure(codedError("read ETIMEDOUT", "ETIMEDOUT")),
		);
		expect(thrown?.code).toBe("SERVICE_UNAVAILABLE");
		expect(thrown?.message).toContain("read ETIMEDOUT");
	});

	test("undici headers timeout (HOST-SERVICE-43)", () => {
		const headersTimeout = codedError(
			"Headers Timeout Error",
			"UND_ERR_HEADERS_TIMEOUT",
		);
		headersTimeout.name = "HeadersTimeoutError";
		const thrown = capture(transportFailure(headersTimeout));
		expect(thrown?.code).toBe("SERVICE_UNAVAILABLE");
		expect(thrown?.message).toContain("Headers Timeout Error");
	});

	test("captive portal presents its own certificate (HOST-SERVICE-46)", () => {
		const thrown = capture(
			transportFailure(
				codedError(
					"Hostname/IP does not match certificate's altnames: Host: api.example.invalid. is not in the cert's altnames: DNS:portal.captive.invalid",
					"ERR_TLS_CERT_ALTNAME_INVALID",
				),
			),
		);
		expect(thrown?.code).toBe("SERVICE_UNAVAILABLE");
		expect(thrown?.message).toContain("does not match certificate's altnames");
	});

	const unreachableCodes = [
		["ECONNREFUSED", "connect ECONNREFUSED 10.0.0.1:443"],
		["ECONNRESET", "read ECONNRESET"],
		["ENOTFOUND", "getaddrinfo ENOTFOUND api.example.invalid"],
		["EAI_AGAIN", "getaddrinfo EAI_AGAIN api.example.invalid"],
		["EHOSTUNREACH", "connect EHOSTUNREACH 10.0.0.1:443"],
		["ENETUNREACH", "connect ENETUNREACH 10.0.0.1:443"],
		["UND_ERR_CONNECT_TIMEOUT", "Connect Timeout Error"],
		[
			"UNABLE_TO_VERIFY_LEAF_SIGNATURE",
			"unable to verify the first certificate",
		],
		["UNABLE_TO_GET_ISSUER_CERT", "unable to get issuer certificate"],
		[
			"UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
			"unable to get local issuer certificate",
		],
		[
			"SELF_SIGNED_CERT_IN_CHAIN",
			"self-signed certificate in certificate chain",
		],
		["DEPTH_ZERO_SELF_SIGNED_CERT", "self-signed certificate"],
	] as const;

	for (const [code, message] of unreachableCodes) {
		test(`${code} is the cloud being unreachable`, () => {
			const thrown = capture(transportFailure(codedError(message, code)));
			expect(thrown?.code).toBe("SERVICE_UNAVAILABLE");
			expect(thrown?.message).toContain(message);
		});
	}

	test("an HTML body where JSON was expected still reports (HOST-SERVICE-41)", () => {
		const thrown = capture(
			TRPCClientError.from(
				new SyntaxError(
					"Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON",
				),
			),
		);
		expect(thrown).toBeNull();
	});

	test("an application error from the cloud API still reports", () => {
		const thrown = capture(
			TRPCClientError.from({
				error: {
					code: -32001,
					message: "UNAUTHORIZED",
					data: { code: "UNAUTHORIZED", httpStatus: 401 },
				},
			}),
		);
		expect(thrown).toBeNull();
	});

	test("a not-found from the cloud API still reports", () => {
		const thrown = capture(
			TRPCClientError.from({
				error: {
					code: -32004,
					message: "Organization not found",
					data: { code: "NOT_FOUND", httpStatus: 404 },
				},
			}),
		);
		expect(thrown).toBeNull();
	});

	test("an error with no cause chain still reports", () => {
		expect(capture(new Error("fetch failed"))).toBeNull();
		expect(capture(new TypeError("fetch failed"))).toBeNull();
	});

	test("an expired certificate still reports", () => {
		const thrown = capture(
			transportFailure(
				codedError("certificate has expired", "CERT_HAS_EXPIRED"),
			),
		);
		expect(thrown).toBeNull();
	});

	test("our own typed error passes through untouched", () => {
		const thrown = capture(
			new TRPCError({
				code: "PRECONDITION_FAILED",
				message: "Organization not found or not accessible from JWT",
			}),
		);
		expect(thrown).toBeNull();
	});
});
