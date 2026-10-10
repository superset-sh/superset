import { describe, expect, test } from "bun:test";
import { GaxiosError } from "gaxios";
import {
	type GoogleOAuthClient,
	refreshClientsFor,
	refreshWithIssuingClient,
} from "./auth";

const primary: GoogleOAuthClient = { clientId: "primary", clientSecret: "p" };
const connector: GoogleOAuthClient = {
	clientId: "connector",
	clientSecret: "c",
};

function oauthError(code: string): GaxiosError {
	return new GaxiosError(code, { url: new URL("https://oauth2.test") }, {
		status: 400,
		data: { error: code },
	} as never);
}

describe("refreshClientsFor", () => {
	test("legacy rows try the primary client first", () => {
		expect(refreshClientsFor(null, primary, connector)).toEqual([
			primary,
			connector,
		]);
		expect(
			refreshClientsFor(
				["openid", "https://www.googleapis.com/auth/gmail.readonly"],
				primary,
				connector,
			),
		).toEqual([primary, connector]);
	});

	test("connector-flow rows try the connector client first", () => {
		expect(
			refreshClientsFor(
				[
					"https://www.googleapis.com/auth/gmail.readonly",
					"https://www.googleapis.com/auth/calendar.events",
				],
				primary,
				connector,
			),
		).toEqual([connector, primary]);
	});

	test("one client when the connector client is unset", () => {
		expect(refreshClientsFor(["x"], primary, null)).toEqual([primary]);
	});
});

describe("refreshWithIssuingClient", () => {
	test("falls back when Google rejects the token for another client", async () => {
		const tried: string[] = [];
		const accepted = await refreshWithIssuingClient(
			[primary, connector],
			async (client) => {
				tried.push(client.clientId);
				if (client === primary) throw oauthError("unauthorized_client");
				return "token";
			},
		);
		expect(tried).toEqual(["primary", "connector"]);
		expect(accepted).toEqual({ client: connector, result: "token" });
	});

	test("reports a revoked grant over a wrong-client answer", async () => {
		const attempt = refreshWithIssuingClient(
			[primary, connector],
			async (client) => {
				throw oauthError(
					client === primary ? "invalid_grant" : "unauthorized_client",
				);
			},
		);
		await expect(attempt).rejects.toThrow("invalid_grant");
	});

	test("does not retry an unrelated failure", async () => {
		const tried: string[] = [];
		const attempt = refreshWithIssuingClient(
			[primary, connector],
			async (client) => {
				tried.push(client.clientId);
				throw new Error("network down");
			},
		);
		await expect(attempt).rejects.toThrow("network down");
		expect(tried).toEqual(["primary"]);
	});
});
