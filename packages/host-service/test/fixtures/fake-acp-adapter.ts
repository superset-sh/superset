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
 *   permissions <a>,<b>   two tool calls whose permission requests are parked
 *                         concurrently; each result stays request-correlated
 *   ask-single <q>|a,b,c  form elicitation, one single-select question;
 *                         echoes `picked:<label>`
 *   ask-multi <q>|a,b,c   form elicitation, one multi-select question;
 *                         echoes `picked:<label>+<label>`
 *   ask-two <q1>|a,b;<q2>|c,d
 *                         form elicitation with two single-select questions;
 *                         echoes `picked:<answer1>&<answer2>` ("skipped" for
 *                         questions the form answer omits)
 *   ask-tool <q>|a,b      opens a tool_call, then an elicitation bound to it
 *                         via toolCallId; the adapter (not the host) sends the
 *                         terminal tool_call_update; echoes `picked:<label>`
 *   ask-url               url-mode elicitation; echoes `url-elicit:<action>`
 *   ask-empty             form elicitation with no question fields; echoes
 *                         `empty-elicit:<action>`
 *   title <text>          session_info_update carrying the title, then a chunk
 *   title-clear           session_info_update with title: null, then a chunk
 *   mode                  echoes `mode:<currentModeId>`
 *   env <NAME>            echoes `env:<NAME>=<value|<unset>>` from this
 *                         process's environment
 *   reject <reason>       throws inside session/prompt — the request errors
 *                         but the adapter process stays alive
 *   hang                  tool_call in_progress; resolves cancelled only on
 *                         session/cancel
 *   crash                 chunk + open tool_call, then process.exit(1)
 *   <anything else>       echoed back as `echo:<text>`
 *
 * Like the real adapter, new sessions start in bypassPermissions so the
 * manager's D14-c default-mode override is exercised on every create.
 *
 * Persistence, mirroring the real adapter's reliance on Claude Code's
 * on-disk session store: session/new mints a unique session id and every
 * update (including the user's prompt chunks, which the real store also
 * keeps) is appended to `<cwd>/.fake-acp-store/<sessionId>.jsonl`. A later
 * process — the manager's restart-resurrection path — replays that file
 * verbatim via session/load before the response resolves, exactly like the
 * real adapter's replay. Loaded sessions start back in bypassPermissions so
 * the manager's on-load bypass override is exercised too.
 *
 * Payload shapes are copied verbatim from the real adapter's construction
 * (claude-agent-acp dist: buildAvailableModes, buildConfigOptions,
 * describeAlwaysAllow's permission options, askUserQuestionsToCreateRequest —
 * including the per-question `question_<n>_custom` "Other" fields) so tests
 * exercise exactly what real runs put on the wire; only the values are canned.
 */
import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import {
	agent,
	ndJsonStream,
	PROTOCOL_VERSION,
	RequestError,
	type schema,
} from "@agentclientprotocol/sdk";

/** Set by session/new (minted) or session/load (from the request). */
let sessionId = "fake-acp-unset";

const storePath = (id: string) =>
	path.join(process.cwd(), ".fake-acp-store", `${id}.jsonl`);

function recordUpdate(update: schema.SessionUpdate): void {
	mkdirSync(path.dirname(storePath(sessionId)), { recursive: true });
	appendFileSync(storePath(sessionId), `${JSON.stringify(update)}\n`);
}

/** Verbatim buildAvailableModes output (sans the model-gated "auto" mode). */
const AVAILABLE_MODES = [
	{
		id: "default",
		name: "Manual",
		description: "Standard behavior, prompts for dangerous operations",
	},
	{
		id: "acceptEdits",
		name: "Accept Edits",
		description: "Auto-accept file edit operations",
	},
	{
		id: "plan",
		name: "Plan Mode",
		description: "Planning mode, no actual tool execution",
	},
	{
		id: "dontAsk",
		name: "Don't Ask",
		description: "Don't prompt for permissions, deny if not pre-approved",
	},
	{
		id: "bypassPermissions",
		name: "Bypass Permissions",
		description: "Bypass all permission checks",
	},
];

let currentModeId = "bypassPermissions";
let toolCallCounter = 0;
let cancelActiveTurn: (() => void) | null = null;

/**
 * Verbatim buildConfigOptions output for a host like ours: Mode and Model
 * selects, plus Fast mode as the two-value select FALLBACK — the host's
 * initialize does not declare `session.configOptions.boolean`, so a real run
 * degrades to this shape (createFastModeConfigOption), never the boolean
 * toggle. Model-gated options (effort, agent) are omitted like a run where
 * the model doesn't support them.
 */
let configOptions: schema.SessionConfigOption[] = [
	{
		id: "mode",
		name: "Mode",
		description: "Session permission mode",
		category: "mode",
		type: "select",
		currentValue: currentModeId,
		options: AVAILABLE_MODES.map((mode) => ({
			value: mode.id,
			name: mode.name,
			description: mode.description,
		})),
	},
	{
		id: "model",
		name: "Model",
		description: "AI model to use",
		category: "model",
		type: "select",
		currentValue: "claude-opus-4-6",
		options: [
			{ value: "claude-opus-4-6", name: "Opus 4.6" },
			{ value: "claude-sonnet-4-5", name: "Sonnet 4.5" },
		],
	},
	{
		id: "fast",
		name: "Fast mode",
		description: "Faster responses on supported models",
		category: "model_config",
		type: "select",
		currentValue: "off",
		options: [
			{ value: "on", name: "On" },
			{ value: "off", name: "Off" },
		],
	},
];

interface AskQuestion {
	question: string;
	labels: string[];
	multiSelect: boolean;
}

/**
 * Verbatim shape of askUserQuestionsToCreateRequest: single-question forms
 * carry the question in `message` (no field description); multi-question
 * forms put each question's text in its field description. Every question is
 * followed by its free-text `question_<n>_custom` "Other" field, which the
 * host must ignore when extracting question cards. `title` is required on
 * every enum option (zEnumOption) — without it the SDK's form-mode schema
 * variant fails and requestedSchema is silently stripped.
 */
function buildAskForm(questions: AskQuestion[]): {
	message: string;
	requestedSchema: Record<string, unknown>;
} {
	const single = questions.length === 1;
	const properties: Record<string, unknown> = {};
	questions.forEach((entry, index) => {
		const options = entry.labels.map((label) => ({
			const: label,
			title: label,
		}));
		const description = single ? undefined : entry.question;
		properties[`question_${index}`] = entry.multiSelect
			? { type: "array", description, items: { anyOf: options } }
			: { type: "string", description, oneOf: options };
		properties[`question_${index}_custom`] = {
			type: "string",
			title: "Other",
			description:
				"Type your own answer instead of choosing an option above (optional).",
		};
	});
	return {
		message: single
			? (questions[0]?.question ?? "")
			: "Please answer the following questions.",
		requestedSchema: { type: "object", properties },
	};
}

/** Parse `<question>|label, label, ...` into an AskQuestion. */
function parseAskSpec(spec: string, multiSelect: boolean): AskQuestion {
	const separator = spec.indexOf("|");
	return {
		question: spec.slice(0, separator),
		labels: spec
			.slice(separator + 1)
			.split(",")
			.map((label) => label.trim()),
		multiSelect,
	};
}

const app = agent({ name: "fake-acp-adapter" })
	.onRequest("initialize", () => ({
		protocolVersion: PROTOCOL_VERSION,
	}))
	.onRequest("session/new", () => {
		sessionId = `fake-acp-${randomUUID()}`;
		return {
			sessionId,
			modes: {
				currentModeId,
				availableModes: AVAILABLE_MODES,
			},
			configOptions,
		};
	})
	.onRequest("session/load", async (context) => {
		sessionId = context.params.sessionId;
		// Like the real adapter: the stored transcript is replayed as ordinary
		// session/update notifications BEFORE the response resolves; an unknown
		// session id errors the request.
		let stored: string;
		try {
			stored = readFileSync(storePath(sessionId), "utf8");
		} catch {
			// A plain throw would surface as an opaque "Internal error" on the
			// client; RequestError carries the message across JSON-RPC.
			throw new RequestError(
				-32002, // resource not found
				`No stored session to load: ${sessionId}`,
			);
		}
		for (const line of stored.split("\n")) {
			if (!line) continue;
			await context.client.notify("session/update", {
				sessionId,
				update: JSON.parse(line) as schema.SessionUpdate,
			});
		}
		return {
			modes: {
				currentModeId,
				availableModes: AVAILABLE_MODES,
			},
			configOptions,
		};
	})
	.onRequest("session/set_mode", (context) => {
		currentModeId = context.params.modeId;
		return {};
	})
	.onRequest("session/set_config_option", (context) => {
		const { configId, value } = context.params;
		configOptions = configOptions.map((option) =>
			option.id === configId
				? ({ ...option, currentValue: value } as schema.SessionConfigOption)
				: option,
		);
		// Like the real adapter: the refreshed catalog rides the response, no
		// config_option_update notification for client-initiated changes.
		return { configOptions };
	})
	.onNotification("session/cancel", () => {
		cancelActiveTurn?.();
	})
	.onRequest("session/prompt", async (context) => {
		const notifyUpdate = (update: schema.SessionUpdate) => {
			recordUpdate(update);
			return context.client.notify("session/update", {
				sessionId,
				update,
			});
		};
		const say = (text: string) =>
			notifyUpdate({
				sessionUpdate: "agent_message_chunk",
				content: { type: "text", text },
			});
		// Store-only, like the real session file: the live adapter never echoes
		// the user's prompt (the host journals it), but replay must include it.
		for (const block of context.params.prompt) {
			recordUpdate({ sessionUpdate: "user_message_chunk", content: block });
		}

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
				// The real option triple: describeAlwaysAllow's default label plus
				// the fixed Allow/Reject pair, with these exact ids and kinds.
				const response = await context.client.request(
					"session/request_permission",
					{
						sessionId,
						toolCall: { toolCallId },
						options: [
							{
								kind: "allow_always",
								name: `Always Allow all ${rest}`,
								optionId: "allow_always",
							},
							{ kind: "allow_once", name: "Allow", optionId: "allow" },
							{ kind: "reject_once", name: "Reject", optionId: "reject" },
						],
					},
				);
				if (response.outcome.outcome !== "selected") {
					return { stopReason: "cancelled" as const };
				}
				if (
					response.outcome.optionId === "allow" ||
					response.outcome.optionId === "allow_always"
				) {
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

			case "permissions": {
				const names = rest
					.split(",")
					.map((name) => name.trim())
					.filter(Boolean);
				if (names.length < 2) {
					throw new Error(
						"permissions requires at least two comma-separated names",
					);
				}
				const outcomes = await Promise.all(
					names.map(async (name) => {
						toolCallCounter += 1;
						const toolCallId = `tool-${toolCallCounter}`;
						await notifyUpdate({
							sessionUpdate: "tool_call",
							toolCallId,
							title: name,
							kind: "execute",
							status: "pending",
						});
						const response = await context.client.request(
							"session/request_permission",
							{
								sessionId,
								toolCall: { toolCallId },
								options: [
									{
										kind: "allow_always",
										name: `Always Allow all ${name}`,
										optionId: "allow_always",
									},
									{
										kind: "allow_once",
										name: "Allow",
										optionId: "allow",
									},
									{
										kind: "reject_once",
										name: "Reject",
										optionId: "reject",
									},
								],
							},
						);
						if (response.outcome.outcome !== "selected") {
							return "cancelled" as const;
						}
						const allowed =
							response.outcome.optionId === "allow" ||
							response.outcome.optionId === "allow_always";
						await notifyUpdate({
							sessionUpdate: "tool_call_update",
							toolCallId,
							status: allowed ? "completed" : "failed",
						});
						await say(`${allowed ? "allowed" : "denied"} ${name}`);
						return allowed ? ("allowed" as const) : ("denied" as const);
					}),
				);
				return {
					stopReason: outcomes.includes("cancelled")
						? ("cancelled" as const)
						: ("end_turn" as const),
				};
			}

			case "ask-single":
			case "ask-multi": {
				const form = buildAskForm([
					parseAskSpec(rest, command === "ask-multi"),
				]);
				const response = await context.client.request("elicitation/create", {
					mode: "form",
					sessionId,
					...form,
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

			case "ask-two": {
				const questionSpecs = rest
					.split(";")
					.map((spec) => parseAskSpec(spec, false));
				const form = buildAskForm(questionSpecs);
				const response = await context.client.request("elicitation/create", {
					mode: "form",
					sessionId,
					...form,
				} as schema.CreateElicitationRequest);
				if (response.action !== "accept") {
					return { stopReason: "cancelled" as const };
				}
				const answers = questionSpecs.map((_spec, index) =>
					String(response.content?.[`question_${index}`] ?? "skipped"),
				);
				await say(`picked:${answers.join("&")}`);
				return { stopReason: "end_turn" as const };
			}

			case "ask-tool": {
				const spec = parseAskSpec(rest, false);
				toolCallCounter += 1;
				const toolCallId = `tool-${toolCallCounter}`;
				await notifyUpdate({
					sessionUpdate: "tool_call",
					toolCallId,
					title: spec.question,
					kind: "other",
					status: "in_progress",
				});
				const form = buildAskForm([spec]);
				const response = await context.client.request("elicitation/create", {
					mode: "form",
					sessionId,
					toolCallId,
					...form,
				} as schema.CreateElicitationRequest);
				// The tool call is adapter-owned, so the terminal status comes from
				// here — the host must not journal a second one.
				await notifyUpdate({
					sessionUpdate: "tool_call_update",
					toolCallId,
					status: response.action === "accept" ? "completed" : "failed",
				});
				if (response.action !== "accept") {
					return { stopReason: "cancelled" as const };
				}
				await say(
					`picked:${String(response.content?.question_0 ?? "nothing")}`,
				);
				return { stopReason: "end_turn" as const };
			}

			case "ask-url": {
				const response = await context.client.request("elicitation/create", {
					mode: "url",
					sessionId,
					elicitationId: "url-elicitation-1",
					url: "https://example.invalid/confirm",
					message: "open this link",
				} as schema.CreateElicitationRequest);
				await say(`url-elicit:${response.action}`);
				return { stopReason: "end_turn" as const };
			}

			case "ask-empty": {
				const response = await context.client.request("elicitation/create", {
					mode: "form",
					sessionId,
					message: "form with nothing to ask",
					requestedSchema: { type: "object", properties: {} },
				} as schema.CreateElicitationRequest);
				await say(`empty-elicit:${response.action}`);
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

			case "title-clear": {
				await notifyUpdate({
					sessionUpdate: "session_info_update",
					title: null,
				});
				await say("title cleared");
				return { stopReason: "end_turn" as const };
			}

			case "mode": {
				await say(`mode:${currentModeId}`);
				return { stopReason: "end_turn" as const };
			}

			case "env": {
				await say(`env:${rest}=${process.env[rest] ?? "<unset>"}`);
				return { stopReason: "end_turn" as const };
			}

			case "reject": {
				// A non-fatal turn failure: the session/prompt request errors but
				// the process stays alive and can take further turns.
				throw new Error(rest || "rejected by fake");
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
