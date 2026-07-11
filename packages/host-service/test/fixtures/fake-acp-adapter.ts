/**
 * Deterministic stand-in for the `claude-agent-acp` adapter, spawned by
 * AcpSessionManager via the `adapterEntry` option. Speaks real ACP over
 * stdio ndjson through the official SDK — same wire protocol, no model, no
 * tokens, no network — so integration tests can drive many turns, permission
 * flows, cancellations, and crashes reproducibly.
 *
 * Behavior is scripted by the first line of each prompt's text:
 *
 *   say <text>            one agent_message_chunk, end_turn
 *   tool <name>           tool_call pending → in_progress → completed + chunk
 *   permission <name>     tool_call + session/request_permission
 *                         (allow → completed, deny → failed), then a chunk
 *   ask-single <q>|a,b,c  form elicitation, one single-select question;
 *                         echoes `picked:<label>`
 *   ask-multi <q>|a,b,c   form elicitation, one multi-select question;
 *                         echoes `picked:<label>+<label>`
 *   title <text>          session_info_update carrying the title, then a chunk
 *   hang                  tool_call in_progress; resolves cancelled only on
 *                         session/cancel
 *   crash                 chunk + open tool_call, then process.exit(1)
 *   <anything else>       echoed back as `echo:<text>`
 *
 * Like the real adapter, new sessions start in bypassPermissions so the
 * manager's D14-c default-mode override is exercised on every create.
 */
import { Readable, Writable } from "node:stream";
import {
	agent,
	ndJsonStream,
	PROTOCOL_VERSION,
	type schema,
} from "@agentclientprotocol/sdk";

const SESSION_ID = "fake-acp-session";

let currentModeId = "bypassPermissions";
let toolCallCounter = 0;
let cancelActiveTurn: (() => void) | null = null;

function elicitationField(
	question: string,
	labels: string[],
	multiSelect: boolean,
): Record<string, unknown> {
	// `title` is required on every enum option (zEnumOption) — without it the
	// SDK's form-mode schema variant fails and requestedSchema is stripped.
	const options = labels.map((label) => ({ const: label, title: label }));
	return multiSelect
		? {
				type: "array",
				description: question,
				items: { anyOf: options },
			}
		: {
				type: "string",
				description: question,
				oneOf: options,
			};
}

const app = agent({ name: "fake-acp-adapter" })
	.onRequest("initialize", () => ({
		protocolVersion: PROTOCOL_VERSION,
	}))
	.onRequest("session/new", () => ({
		sessionId: SESSION_ID,
		modes: {
			currentModeId,
			availableModes: [
				{ id: "default", name: "Default" },
				{ id: "bypassPermissions", name: "Bypass Permissions" },
			],
		},
	}))
	.onRequest("session/set_mode", (context) => {
		currentModeId = context.params.modeId;
		return {};
	})
	.onNotification("session/cancel", () => {
		cancelActiveTurn?.();
	})
	.onRequest("session/prompt", async (context) => {
		const notifyUpdate = (update: schema.SessionUpdate) =>
			context.client.notify("session/update", {
				sessionId: SESSION_ID,
				update,
			});
		const say = (text: string) =>
			notifyUpdate({
				sessionUpdate: "agent_message_chunk",
				content: { type: "text", text },
			});

		const text = context.params.prompt
			.map((block) => (block.type === "text" ? block.text : ""))
			.join("\n");
		const [command = "", rest = ""] = ((split) =>
			split === -1
				? [text, ""]
				: [text.slice(0, split), text.slice(split + 1)])(text.indexOf(" "));

		switch (command) {
			case "say": {
				await say(rest);
				return { stopReason: "end_turn" as const };
			}

			case "tool": {
				toolCallCounter += 1;
				const toolCallId = `tool-${toolCallCounter}`;
				await notifyUpdate({
					sessionUpdate: "tool_call",
					toolCallId,
					title: rest,
					kind: "execute",
					status: "pending",
				});
				await notifyUpdate({
					sessionUpdate: "tool_call_update",
					toolCallId,
					status: "in_progress",
				});
				await notifyUpdate({
					sessionUpdate: "tool_call_update",
					toolCallId,
					status: "completed",
				});
				await say(`tool ${rest} done`);
				return { stopReason: "end_turn" as const };
			}

			case "permission": {
				toolCallCounter += 1;
				const toolCallId = `tool-${toolCallCounter}`;
				await notifyUpdate({
					sessionUpdate: "tool_call",
					toolCallId,
					title: rest,
					kind: "execute",
					status: "pending",
				});
				const response = await context.client.request(
					"session/request_permission",
					{
						sessionId: SESSION_ID,
						toolCall: { toolCallId },
						options: [
							{ optionId: "allow", name: "Allow", kind: "allow_once" },
							{ optionId: "deny", name: "Deny", kind: "reject_once" },
						],
					},
				);
				if (response.outcome.outcome !== "selected") {
					return { stopReason: "cancelled" as const };
				}
				if (response.outcome.optionId === "allow") {
					await notifyUpdate({
						sessionUpdate: "tool_call_update",
						toolCallId,
						status: "completed",
					});
					await say(`allowed ${rest}`);
				} else {
					await notifyUpdate({
						sessionUpdate: "tool_call_update",
						toolCallId,
						status: "failed",
					});
					await say(`denied ${rest}`);
				}
				return { stopReason: "end_turn" as const };
			}

			case "ask-single":
			case "ask-multi": {
				const multiSelect = command === "ask-multi";
				const separator = rest.indexOf("|");
				const question = rest.slice(0, separator);
				const labels = rest
					.slice(separator + 1)
					.split(",")
					.map((label) => label.trim());
				const response = await context.client.request("elicitation/create", {
					mode: "form",
					sessionId: SESSION_ID,
					message: question,
					requestedSchema: {
						type: "object",
						properties: {
							question_0: elicitationField(question, labels, multiSelect),
						},
					},
				} as schema.CreateElicitationRequest);
				if (response.action !== "accept") {
					return { stopReason: "cancelled" as const };
				}
				const answer = response.content?.question_0;
				await say(
					`picked:${Array.isArray(answer) ? answer.join("+") : String(answer ?? "nothing")}`,
				);
				return { stopReason: "end_turn" as const };
			}

			case "title": {
				await notifyUpdate({
					sessionUpdate: "session_info_update",
					title: rest,
				});
				await say(`titled ${rest}`);
				return { stopReason: "end_turn" as const };
			}

			case "hang": {
				toolCallCounter += 1;
				await notifyUpdate({
					sessionUpdate: "tool_call",
					toolCallId: `tool-${toolCallCounter}`,
					title: "hang",
					kind: "execute",
					status: "in_progress",
				});
				await new Promise<void>((resolve) => {
					cancelActiveTurn = resolve;
				});
				cancelActiveTurn = null;
				return { stopReason: "cancelled" as const };
			}

			case "crash": {
				await say("about to crash");
				toolCallCounter += 1;
				await notifyUpdate({
					sessionUpdate: "tool_call",
					toolCallId: `tool-${toolCallCounter}`,
					title: "crash",
					kind: "execute",
					status: "in_progress",
				});
				setTimeout(() => process.exit(1), 20);
				// Never resolves — the process dies mid-request, like a real crash.
				return new Promise<never>(() => {});
			}

			default: {
				await say(`echo:${text}`);
				return { stopReason: "end_turn" as const };
			}
		}
	});

// `toWeb` returns differently-parameterized stream types depending on the
// active @types/node lib — same unknown-cast the manager itself uses.
app.connect(
	ndJsonStream(
		Writable.toWeb(process.stdout) as unknown as WritableStream<Uint8Array>,
		Readable.toWeb(process.stdin) as unknown as ReadableStream<Uint8Array>,
	),
);
