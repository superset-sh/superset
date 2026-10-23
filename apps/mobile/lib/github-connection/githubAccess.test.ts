import { expect, test } from "bun:test";
import { TRPCClientError } from "@trpc/client";
import { githubAccessFailure } from "./githubAccess";

function serverError(code: string) {
	return TRPCClientError.from({
		error: { message: code, code: -32000, data: { code } },
	});
}

test("only the API's own GitHub answers classify; transport failures do not", () => {
	expect(githubAccessFailure(serverError("PRECONDITION_FAILED"))).toBe(
		"not-connected",
	);
	expect(githubAccessFailure(serverError("NOT_FOUND"))).toBe("no-access");
	expect(githubAccessFailure(serverError("FORBIDDEN"))).toBe("no-access");
	expect(githubAccessFailure(serverError("CONFLICT"))).toBeNull();
	expect(githubAccessFailure(new Error("Network request failed"))).toBeNull();
});
