import { describe, expect, test } from "bun:test";
import { buildSessionStreamUrl } from "./session-stream-url";

describe("buildSessionStreamUrl", () => {
	test("builds a wss relay URL with encoded routing and credentials", () => {
		expect(
			buildSessionStreamUrl({
				relayUrl: "https://relay.example.test/",
				organizationId: "org / one",
				hostId: "host:one",
				sessionId: "session / ?",
				token: "header.payload+/=",
			}),
		).toBe(
			"wss://relay.example.test/hosts/org%20%2F%20one%3Ahost%3Aone/sessions/session%20%2F%20%3F/stream?token=header.payload%2B%2F%3D",
		);
	});

	test("converts an http relay URL to ws", () => {
		expect(
			buildSessionStreamUrl({
				relayUrl: "http://127.0.0.1:4000",
				organizationId: "org",
				hostId: "host",
				sessionId: "session",
				token: "token",
			}),
		).toBe(
			"ws://127.0.0.1:4000/hosts/org%3Ahost/sessions/session/stream?token=token",
		);
	});
});
