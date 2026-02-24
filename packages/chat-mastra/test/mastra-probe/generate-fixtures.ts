import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { MastraChatEventEnvelope } from "../../src/client/hooks/use-mastra-chat/materialize";
import {
	materializeMastraDisplayState,
	serializeMastraDisplayState,
} from "../../src/client/hooks/use-mastra-chat/materialize";
import { createMastraProbeService } from "./service";

interface ProbeLogRecord {
	timestamp: string;
	sessionId?: string;
	sequenceHint?: number;
	channel: "service" | "submit" | "harness";
	payload: unknown;
}

interface OpenSessionConfig {
	storage?: {
		url: string;
		authToken?: string;
	};
	initialState?: Record<string, unknown>;
	disableMcp?: boolean;
	disableHooks?: boolean;
}

const routeBase = "/chat-mastra/test";
const fixtureDir = path.join(
	process.cwd(),
	"src/client/hooks/use-mastra-chat/materialize/fixtures",
);

function asObject(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

async function callJson<T = unknown>(
	appFetch: typeof fetch,
	pathname: string,
	init?: RequestInit,
): Promise<T> {
	const response = await appFetch(`http://localhost${pathname}`, init);
	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new Error(`Request failed ${response.status} ${pathname}: ${text}`);
	}
	return (await response.json()) as T;
}

async function readSessionEntries(
	appFetch: typeof fetch,
	sessionId: string,
): Promise<ProbeLogRecord[]> {
	const result = await callJson<{ entries: ProbeLogRecord[] }>(
		appFetch,
		`${routeBase}/logs?sessionId=${sessionId}&limit=5000`,
	);
	return result.entries;
}

async function writeFixture(
	scenario: string,
	variant: string,
	records: ProbeLogRecord[],
): Promise<void> {
	const targetDir = path.join(fixtureDir, scenario, variant);
	await fs.mkdir(targetDir, { recursive: true });
	const eventsPath = path.join(targetDir, "events.ndjson");
	const candidateOutputPath = path.join(targetDir, "output.candidate.json");
	const eventsNdjson = records
		.map((record) => JSON.stringify(record))
		.join("\n");
	await fs.writeFile(eventsPath, `${eventsNdjson}\n`, "utf8");

	// Non-authoritative helper for review only.
	// output.json remains the human-approved oracle used by tests.
	// TODO(chat-mastra): replace candidate generation with an oracle captured
	// from Mastra runtime once harness.getDisplayState()/snapshot is exposed.
	await fs.writeFile(
		candidateOutputPath,
		`${JSON.stringify(
			serializeMastraDisplayState(
				materializeMastraDisplayState(toChatEnvelopes(records)),
			),
			null,
			2,
		)}\n`,
		"utf8",
	);
}

function toChatEnvelopes(
	records: ReadonlyArray<ProbeLogRecord>,
): MastraChatEventEnvelope[] {
	const envelopes: MastraChatEventEnvelope[] = [];
	for (const record of records) {
		if (record.channel !== "submit" && record.channel !== "harness") continue;
		if (!record.sessionId) continue;
		if (typeof record.sequenceHint !== "number") continue;
		envelopes.push({
			kind: record.channel,
			sessionId: record.sessionId,
			timestamp: record.timestamp,
			sequenceHint: record.sequenceHint,
			payload: record.payload,
		});
	}
	return envelopes;
}

async function openSession(
	appFetch: typeof fetch,
	sessionId: string,
	config?: OpenSessionConfig,
): Promise<void> {
	await callJson(appFetch, `${routeBase}/sessions/open`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ sessionId, ...(config ? { config } : {}) }),
	});
}

async function closeSession(
	appFetch: typeof fetch,
	sessionId: string,
): Promise<void> {
	await callJson(appFetch, `${routeBase}/sessions/${sessionId}/close`, {
		method: "POST",
	});
}

async function sendMessage(
	appFetch: typeof fetch,
	sessionId: string,
	input: {
		content: string;
		files?: Array<{ url: string; mediaType: string; filename?: string }>;
		metadata?: {
			model?: string;
			permissionMode?: string;
			thinkingEnabled?: boolean;
		};
		clientMessageId?: string;
	},
): Promise<void> {
	await callJson(appFetch, `${routeBase}/sessions/${sessionId}/message`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(input),
	});
}

async function control(
	appFetch: typeof fetch,
	sessionId: string,
	action: "stop" | "abort",
): Promise<void> {
	await callJson(appFetch, `${routeBase}/sessions/${sessionId}/control`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ action }),
	});
}

async function approvalRespond(
	appFetch: typeof fetch,
	sessionId: string,
	toolCallId?: string,
): Promise<void> {
	await callJson(appFetch, `${routeBase}/sessions/${sessionId}/approval`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			decision: "approve",
			toolCallId,
		}),
	});
}

async function questionRespond(
	appFetch: typeof fetch,
	sessionId: string,
	questionId: string,
): Promise<void> {
	await callJson(appFetch, `${routeBase}/sessions/${sessionId}/question`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			questionId,
			answer: "fixture-answer",
		}),
	});
}

async function planRespond(
	appFetch: typeof fetch,
	sessionId: string,
	planId: string,
): Promise<void> {
	await callJson(appFetch, `${routeBase}/sessions/${sessionId}/plan`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			planId,
			action: "reject",
			feedback: "fixture-feedback",
		}),
	});
}

function findHarnessEventsByType(
	records: ReadonlyArray<ProbeLogRecord>,
	type: string,
): ProbeLogRecord[] {
	return records.filter((record) => {
		if (record.channel !== "harness") return false;
		const payload = asObject(record.payload);
		return asString(payload?.type) === type;
	});
}

async function waitForHarnessEvent(
	appFetch: typeof fetch,
	sessionId: string,
	eventType: string,
	options?: {
		minCount?: number;
		timeoutMs?: number;
		pollMs?: number;
	},
): Promise<ProbeLogRecord> {
	const minCount = options?.minCount ?? 1;
	const timeoutMs = options?.timeoutMs ?? 90_000;
	const pollMs = options?.pollMs ?? 250;
	const start = Date.now();

	while (Date.now() - start < timeoutMs) {
		const entries = await readSessionEntries(appFetch, sessionId);
		const matches = findHarnessEventsByType(entries, eventType);
		if (matches.length >= minCount) {
			return matches[matches.length - 1] as ProbeLogRecord;
		}
		await Bun.sleep(pollMs);
	}

	const entries = await readSessionEntries(appFetch, sessionId);
	const seenTypes = [
		...new Set(
			entries
				.filter((record) => record.channel === "harness")
				.map(
					(record) => asString(asObject(record.payload)?.type) ?? "<missing>",
				),
		),
	].sort();
	throw new Error(
		`Timed out waiting for ${eventType} on session ${sessionId}. Seen: ${seenTypes.join(", ")}`,
	);
}

async function captureToolApprovalFixture(
	appFetch: typeof fetch,
	sessionId: string,
): Promise<void> {
	await openSession(appFetch, sessionId, {
		initialState: {
			yolo: false,
			permissionRules: {
				categories: {
					read: "allow",
					edit: "ask",
					execute: "ask",
					mcp: "ask",
				},
				tools: {},
			},
		},
	});
	await sendMessage(appFetch, sessionId, {
		content:
			"Run `pwd` using your execute command tool, then summarize the output in one sentence.",
	});
	const approvalEvent = await waitForHarnessEvent(
		appFetch,
		sessionId,
		"tool_approval_required",
	);
	const toolCallId = asString(asObject(approvalEvent.payload)?.toolCallId);
	await approvalRespond(appFetch, sessionId, toolCallId);
	await waitForHarnessEvent(appFetch, sessionId, "agent_end");
	await closeSession(appFetch, sessionId);
}

async function captureAskQuestionFixture(
	appFetch: typeof fetch,
	sessionId: string,
): Promise<void> {
	await openSession(appFetch, sessionId);
	await sendMessage(appFetch, sessionId, {
		content:
			"Before any analysis, call the ask_user tool with a multiple-choice question that has options A and B.",
	});
	const askEvent = await waitForHarnessEvent(
		appFetch,
		sessionId,
		"ask_question",
	);
	const questionId = asString(asObject(askEvent.payload)?.questionId);
	if (!questionId) {
		throw new Error(`ask_question emitted without questionId for ${sessionId}`);
	}
	await questionRespond(appFetch, sessionId, questionId);
	await waitForHarnessEvent(appFetch, sessionId, "agent_end");
	await closeSession(appFetch, sessionId);
}

async function capturePlanApprovalFixture(
	appFetch: typeof fetch,
	sessionId: string,
): Promise<void> {
	await openSession(appFetch, sessionId);
	await sendMessage(appFetch, sessionId, {
		content:
			"Create a concise three-step plan for adding a health endpoint and call submit_plan with that plan instead of implementing.",
	});
	const planEvent = await waitForHarnessEvent(
		appFetch,
		sessionId,
		"plan_approval_required",
	);
	const planId = asString(asObject(planEvent.payload)?.planId);
	if (!planId) {
		throw new Error(
			`plan_approval_required emitted without planId for ${sessionId}`,
		);
	}
	await planRespond(appFetch, sessionId, planId);
	await waitForHarnessEvent(appFetch, sessionId, "agent_end", { minCount: 2 });
	await closeSession(appFetch, sessionId);
}

async function main(): Promise<void> {
	const logFilePath = path.join(
		os.tmpdir(),
		"chat-mastra-probe",
		`fixture-capture-${Date.now()}-${randomUUID()}`,
		"events.ndjson",
	);
	const { app, closeAllSessions } = createMastraProbeService({
		logFilePath,
		basePath: routeBase,
		defaultCwd: process.cwd(),
	});
	const appFetch: typeof fetch = app.request.bind(app) as typeof fetch;

	const SESSION_APPROVAL_SUBMIT = "66666666-6666-4666-8666-666666666666";
	const SESSION_MULTI_TURN = "77777777-7777-4777-8777-777777777777";
	const SESSION_WITH_FILE = "88888888-8888-4888-8888-888888888888";
	const SESSION_STOP = "99999999-9999-4999-8999-999999999999";
	const SESSION_TOOL_APPROVAL_REQUIRED = "12121212-1212-4121-8121-121212121212";
	const SESSION_ASK_QUESTION = "13131313-1313-4131-8131-131313131313";
	const SESSION_PLAN_APPROVAL_REQUIRED = "14141414-1414-4141-8141-141414141414";

	try {
		await openSession(appFetch, SESSION_APPROVAL_SUBMIT);
		await sendMessage(appFetch, SESSION_APPROVAL_SUBMIT, {
			content: "Try to run a task that might ask for approval",
		});
		await waitForHarnessEvent(appFetch, SESSION_APPROVAL_SUBMIT, "agent_end");
		await approvalRespond(
			appFetch,
			SESSION_APPROVAL_SUBMIT,
			"fixture-tool-call",
		);
		await questionRespond(
			appFetch,
			SESSION_APPROVAL_SUBMIT,
			"fixture-question",
		);
		await planRespond(appFetch, SESSION_APPROVAL_SUBMIT, "fixture-plan");
		await closeSession(appFetch, SESSION_APPROVAL_SUBMIT);

		await openSession(appFetch, SESSION_MULTI_TURN);
		await sendMessage(appFetch, SESSION_MULTI_TURN, {
			content: "first turn",
			clientMessageId: "fixture-turn-1",
		});
		await waitForHarnessEvent(appFetch, SESSION_MULTI_TURN, "agent_end");
		await sendMessage(appFetch, SESSION_MULTI_TURN, {
			content: "second turn",
			clientMessageId: "fixture-turn-2",
		});
		await waitForHarnessEvent(appFetch, SESSION_MULTI_TURN, "agent_end", {
			minCount: 2,
		});
		await closeSession(appFetch, SESSION_MULTI_TURN);

		await openSession(appFetch, SESSION_WITH_FILE);
		await sendMessage(appFetch, SESSION_WITH_FILE, {
			content: "summarize this attached file",
			files: [
				{
					url: "data:text/plain;base64,SGVsbG8gZnJvbSBmaXh0dXJl",
					mediaType: "text/plain",
					filename: "fixture.txt",
				},
			],
			metadata: {
				model: "anthropic/claude-sonnet-4",
				permissionMode: "ask",
				thinkingEnabled: true,
			},
		});
		await waitForHarnessEvent(appFetch, SESSION_WITH_FILE, "agent_end");
		await closeSession(appFetch, SESSION_WITH_FILE);

		await openSession(appFetch, SESSION_STOP);
		await sendMessage(appFetch, SESSION_STOP, {
			content: "generate output then stop",
		});
		await waitForHarnessEvent(appFetch, SESSION_STOP, "agent_start");
		await control(appFetch, SESSION_STOP, "stop");
		await waitForHarnessEvent(appFetch, SESSION_STOP, "agent_end");
		await closeSession(appFetch, SESSION_STOP);

		await captureToolApprovalFixture(appFetch, SESSION_TOOL_APPROVAL_REQUIRED);
		await captureAskQuestionFixture(appFetch, SESSION_ASK_QUESTION);
		await capturePlanApprovalFixture(appFetch, SESSION_PLAN_APPROVAL_REQUIRED);

		await writeFixture(
			"approval-question-plan-submit",
			"default",
			await readSessionEntries(appFetch, SESSION_APPROVAL_SUBMIT),
		);
		await writeFixture(
			"multi-turn-auth-error",
			"default",
			await readSessionEntries(appFetch, SESSION_MULTI_TURN),
		);
		await writeFixture(
			"submit-with-file",
			"default",
			await readSessionEntries(appFetch, SESSION_WITH_FILE),
		);
		await writeFixture(
			"stop-control",
			"default",
			await readSessionEntries(appFetch, SESSION_STOP),
		);
		await writeFixture(
			"tool-approval-required",
			"default",
			await readSessionEntries(appFetch, SESSION_TOOL_APPROVAL_REQUIRED),
		);
		await writeFixture(
			"ask-question",
			"default",
			await readSessionEntries(appFetch, SESSION_ASK_QUESTION),
		);
		await writeFixture(
			"plan-approval-required",
			"default",
			await readSessionEntries(appFetch, SESSION_PLAN_APPROVAL_REQUIRED),
		);
	} finally {
		await closeAllSessions();
	}
}

await main();
