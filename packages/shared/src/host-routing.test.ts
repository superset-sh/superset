import { describe, expect, test } from "bun:test";
import { buildUpstreamHeaders } from "./host-routing";

describe("buildUpstreamHeaders", () => {
	test("stamps the verified user id and drops host/authorization", () => {
		const headers = buildUpstreamHeaders(
			new Headers({
				host: "relay.example",
				authorization: "Bearer user-jwt",
				"content-type": "application/json",
				"x-superset-client-machine-id": "machine-b",
			}),
			"user-1",
		);

		expect(headers).toEqual({
			"content-type": "application/json",
			"x-superset-client-machine-id": "machine-b",
			"x-superset-user-id": "user-1",
		});
	});

	test("overwrites a client-supplied user id — only the JWT names the caller", () => {
		const headers = buildUpstreamHeaders(
			new Headers({ "X-Superset-User-Id": "someone-else" }),
			"user-1",
		);

		expect(headers["x-superset-user-id"]).toBe("user-1");
	});
});
