import { describe, expect, test } from "bun:test";
import { sendExpoPush } from "./expo-push";

const message = (to: string) => ({
	to,
	title: "my-workspace",
	body: "Agent finished",
	data: { workspaceId: "w1", terminalId: "t1" },
});

describe("sendExpoPush", () => {
	test("returns only the tokens Expo reports as unregistered", async () => {
		let sent: unknown;
		const fetchImpl = (async (
			_url: string | URL | Request,
			init?: RequestInit,
		) => {
			sent = JSON.parse(String(init?.body));
			return new Response(
				JSON.stringify({
					data: [
						{ status: "ok", id: "a" },
						{ status: "error", details: { error: "DeviceNotRegistered" } },
						{ status: "error", details: { error: "MessageRateExceeded" } },
					],
				}),
			);
		}) as typeof fetch;

		const dead = await sendExpoPush(
			[message("t-ok"), message("t-dead"), message("t-busy")],
			fetchImpl,
		);

		expect(dead).toEqual(["t-dead"]);
		expect(sent).toHaveLength(3);
		expect((sent as { sound: string }[])[0]?.sound).toBe("default");
	});

	test("throws on an upstream failure", async () => {
		const fetchImpl = (async () =>
			new Response("down", { status: 503 })) as typeof fetch;
		await expect(sendExpoPush([message("t")], fetchImpl)).rejects.toThrow(
			/503/,
		);
	});
});
