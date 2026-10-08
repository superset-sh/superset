import { beforeEach, expect, mock, test } from "bun:test";
import * as verifyQstash from "@/lib/verifyQstash";
import { stub } from "../../../../../../../test/stub";
import * as assistantMessageEvents from "../../events/process-assistant-message";
import * as mentionEvents from "../../events/process-mention";

const verify = mock(
	async (
		_request: Request,
		_body: string,
		_path: string,
	): Promise<Response | null> => null,
);
const processMention = mock(async (_args: unknown) => {});
const processMessage = mock(async (_args: unknown) => {});
stub(verifyQstash, { verifyQstashRequest: verify });
stub(mentionEvents, { processSlackMention: processMention });
stub(assistantMessageEvents, { processAssistantMessage: processMessage });
const mention = await import("./route");
const message = await import("../process-assistant-message/route");
beforeEach(() => {
	verify.mockClear();
	processMention.mockClear();
	processMessage.mockClear();
});

for (const [name, route] of [
	["mention", mention],
	["DM", message],
] as const) {
	test(`${name} verifies queue signatures before parsing payloads`, async () => {
		verify.mockImplementationOnce(async () =>
			Response.json({ error: "Invalid signature" }, { status: 401 }),
		);
		const result = await route.POST(
			new Request("http://localhost/job", { method: "POST", body: "invalid" }),
		);
		expect(result.status).toBe(401);
	});
	test(`${name} rejects malformed JSON and invalid payloads without executing`, async () => {
		for (const body of ["invalid", "null", "{}"]) {
			const result = await route.POST(
				new Request("http://localhost/job", { method: "POST", body }),
			);
			expect(result.status).toBe(400);
		}
		expect(processMention).not.toHaveBeenCalled();
		expect(processMessage).not.toHaveBeenCalled();
	});
}
