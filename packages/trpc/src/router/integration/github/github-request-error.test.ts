import { expect, test } from "bun:test";
import { githubRequestError } from "./github-request-error";

test("GitHub's status becomes the error code the desktop branches on", () => {
	expect(
		githubRequestError(
			Object.assign(new Error("not mergeable"), { status: 405 }),
			"x",
		).code,
	).toBe("CONFLICT");
	expect(githubRequestError({ status: 404 }, "fallback")).toMatchObject({
		code: "NOT_FOUND",
		message: "fallback",
	});
	expect(
		githubRequestError({ errors: [{ message: "already a draft" }] }, "x").code,
	).toBe("BAD_REQUEST");
	expect(
		githubRequestError(
			{ errors: [{ type: "NOT_FOUND", message: "Could not resolve" }] },
			"x",
		).code,
	).toBe("NOT_FOUND");
	expect(githubRequestError(new Error("boom"), "x").code).toBe(
		"INTERNAL_SERVER_ERROR",
	);
});
