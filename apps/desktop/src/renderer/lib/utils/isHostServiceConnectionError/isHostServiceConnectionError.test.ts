import { expect, test } from "bun:test";
import { TRPCClientError } from "@trpc/client";
import { isHostServiceConnectionError } from "./isHostServiceConnectionError";

test.each([
	["SERVICE_UNAVAILABLE", "Host is not online"],
	["BAD_GATEWAY", "Host could not reach the relay"],
	["BAD_GATEWAY", "Request timed out"],
])("reconnects after the relay returns %s: %s", (code, message) => {
	const error = TRPCClientError.from({
		error: { message, code: -32603, data: { code } },
	});
	expect(isHostServiceConnectionError(error)).toBe(true);
});

test.each([
	"UNAUTHORIZED",
	"FORBIDDEN",
	"NOT_FOUND",
	"BAD_REQUEST",
	"INTERNAL_SERVER_ERROR",
])("does not retry a host rejection: %s", (code) => {
	const error = TRPCClientError.from({
		error: { message: "Host is not online", code: -32603, data: { code } },
	});
	expect(isHostServiceConnectionError(error)).toBe(false);
});

test("still reconnects after a direct transport failure", () => {
	expect(
		isHostServiceConnectionError(
			TRPCClientError.from(new TypeError("Failed to fetch")),
		),
	).toBe(true);
	expect(isHostServiceConnectionError(new Error("Host is not online"))).toBe(
		false,
	);
});
