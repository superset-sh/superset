import { expect, test } from "bun:test";
import type { ConnectionSecrets } from "../../../../lib/connectors/upsert";
import { slackServer } from "./index";

test("tools act as the person who connected, not as the workspace bot", () => {
	const secrets = {
		accessToken: "xoxp-person",
		config: { bot_token: "xoxb-bot" },
	} as unknown as ConnectionSecrets;
	expect(slackServer.credential(secrets)).toBe("xoxp-person");
});
