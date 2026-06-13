import { describe, expect, test } from "bun:test";
import { describeDispatchError } from "./dispatch-errors";
import { RelayDispatchError } from "./relay-client";

describe("describeDispatchError", () => {
	test("normalizes project setup relay precondition failures", () => {
		const error = new RelayDispatchError(
			"relay 412: noisy",
			412,
			JSON.stringify({
				error: {
					json: {
						message:
							"Project is not set up on this host and has no repository clone URL. Import the project on this host before running tasks there.",
					},
				},
			}),
		);

		expect(describeDispatchError(error, "dispatch")).toBe(
			"dispatch: Automation should not require a project workspace. Restart or update Superset on the selected host, then try again.",
		);
	});

	test("uses parsed relay messages when available", () => {
		const error = new RelayDispatchError(
			"relay 500: noisy",
			500,
			JSON.stringify({ error: { json: { message: "host failed" } } }),
		);

		expect(describeDispatchError(error, "dispatch")).toBe(
			"dispatch: host failed",
		);
	});
});
