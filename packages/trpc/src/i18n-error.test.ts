import { describe, expect, test } from "bun:test";
import { formatError, isI18nErrorCause, userError } from "./i18n-error";

// Round trip: userError() → errorFormatter → the client-visible shape.data.
// TRPCError.cause is NOT serialized by tRPC, so this is the contract that
// keeps errorMessage() on the client working.
describe("i18n error contract", () => {
	test("userError attaches a typed cause", () => {
		const err = userError({
			code: "BAD_REQUEST",
			message: "This slug is already taken",
			i18nKey: "serverError.organization.slugTaken",
		});
		expect(err.code).toBe("BAD_REQUEST");
		expect(err.message).toBe("This slug is already taken");
		expect(isI18nErrorCause(err.cause)).toBe(true);
	});

	test("formatError copies i18nKey and params into shape.data", () => {
		const err = userError({
			code: "NOT_FOUND",
			message: "Workspace not found",
			i18nKey: "serverError.workspace.notFound",
			params: { name: "api" },
		});
		const shape = formatError({
			shape: { message: err.message, code: -32600, data: { httpStatus: 404 } },
			error: err,
		});
		expect(shape.data).toMatchObject({
			httpStatus: 404,
			i18nKey: "serverError.workspace.notFound",
			i18nParams: { name: "api" },
		});
	});

	test("malformed i18nParams are rejected, not forwarded to clients", () => {
		for (const i18nParams of ["not-a-record", ["a"], { nested: {} }, 5]) {
			const shape = formatError({
				shape: { message: "x", code: -32600, data: {} },
				error: { cause: { i18nKey: "serverError.x", i18nParams } },
			});
			expect(shape.data).toMatchObject({ i18nKey: null, i18nParams: null });
		}
	});

	test("plain errors format with null i18n fields", () => {
		const shape = formatError({
			shape: { message: "boom", code: -32603, data: {} },
			error: new Error("boom"),
		});
		expect(shape.data).toMatchObject({ i18nKey: null, i18nParams: null });
	});
});
