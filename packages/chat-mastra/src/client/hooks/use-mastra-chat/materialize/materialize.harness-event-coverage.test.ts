import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { loadFixtureRecords } from "./fixtures/utils";

const HARNESS_EVENT_CLASSIFICATION: Record<string, "handled" | "auxiliary"> = {
	mode_changed: "auxiliary",
	model_changed: "auxiliary",
	thread_changed: "auxiliary",
	thread_created: "auxiliary",
	state_changed: "auxiliary",
	display_state_changed: "auxiliary",
	agent_start: "handled",
	agent_end: "handled",
	message_start: "handled",
	message_update: "handled",
	message_end: "handled",
	tool_start: "auxiliary",
	tool_approval_required: "auxiliary",
	tool_update: "auxiliary",
	tool_end: "auxiliary",
	tool_input_start: "auxiliary",
	tool_input_delta: "auxiliary",
	tool_input_end: "auxiliary",
	shell_output: "auxiliary",
	usage_update: "handled",
	info: "auxiliary",
	error: "handled",
	follow_up_queued: "auxiliary",
	workspace_status_changed: "auxiliary",
	workspace_ready: "auxiliary",
	workspace_error: "auxiliary",
	om_status: "auxiliary",
	om_observation_start: "auxiliary",
	om_observation_end: "auxiliary",
	om_observation_failed: "auxiliary",
	om_reflection_start: "auxiliary",
	om_reflection_end: "auxiliary",
	om_reflection_failed: "auxiliary",
	om_model_changed: "auxiliary",
	om_buffering_start: "auxiliary",
	om_buffering_end: "auxiliary",
	om_buffering_failed: "auxiliary",
	om_activation: "auxiliary",
	ask_question: "auxiliary",
	plan_approval_required: "auxiliary",
	plan_approved: "auxiliary",
	subagent_start: "auxiliary",
	subagent_text_delta: "auxiliary",
	subagent_tool_start: "auxiliary",
	subagent_tool_end: "auxiliary",
	subagent_end: "auxiliary",
	subagent_model_changed: "auxiliary",
	task_updated: "auxiliary",
};

const require = createRequire(import.meta.url);

function extractHarnessEventTypes(): string[] {
	const mastraPackagePath = require.resolve("mastracode/package.json");
	const harnessTypesPath = path.resolve(
		path.dirname(mastraPackagePath),
		"..",
		"@mastra",
		"core",
		"dist",
		"harness",
		"types.d.ts",
	);
	const source = readFileSync(harnessTypesPath, "utf8");
	const start = source.indexOf("export type HarnessEvent =");
	const end = source.indexOf(
		"/**\n * Listener function for harness events.",
		start,
	);
	if (start < 0 || end < 0) {
		throw new Error("Unable to find HarnessEvent union in @mastra/core types");
	}

	const unionBlock = source.slice(start, end);
	const matches = unionBlock.matchAll(/type:\s*'([^']+)'/g);
	return [...new Set([...matches].map((match) => match[1]))].sort();
}

describe("harness event coverage contract", () => {
	it("classifies every upstream HarnessEvent type explicitly", () => {
		const upstreamTypes = extractHarnessEventTypes();
		const localTypes = Object.keys(HARNESS_EVENT_CLASSIFICATION).sort();

		const missingLocalClassification = upstreamTypes.filter(
			(type) => !(type in HARNESS_EVENT_CLASSIFICATION),
		);
		const staleLocalClassification = localTypes.filter(
			(type) => !upstreamTypes.includes(type),
		);

		expect(missingLocalClassification).toEqual([]);
		expect(staleLocalClassification).toEqual([]);
		expect(
			Object.values(HARNESS_EVENT_CLASSIFICATION).filter(
				(classification) => classification === "handled",
			).length,
		).toBe(7);
	});

	it("confirms user turns are submit events, not harness message payloads", () => {
		const records = loadFixtureRecords("basic-auth-error");
		const harnessMessageRoles = records
			.filter((record) => record.channel === "harness")
			.map((record) => {
				const payload =
					record.payload && typeof record.payload === "object"
						? (record.payload as Record<string, unknown>)
						: null;
				if (!payload) return null;
				const type =
					typeof payload.type === "string" ? payload.type : undefined;
				if (
					type !== "message_start" &&
					type !== "message_update" &&
					type !== "message_end"
				) {
					return null;
				}
				const message =
					payload.message && typeof payload.message === "object"
						? (payload.message as Record<string, unknown>)
						: null;
				return typeof message?.role === "string" ? message.role : null;
			})
			.filter((role): role is string => Boolean(role));

		const userSubmitEvents = records.filter((record) => {
			if (record.channel !== "submit") return false;
			const payload =
				record.payload && typeof record.payload === "object"
					? (record.payload as Record<string, unknown>)
					: null;
			return payload?.type === "user_message_submitted";
		});

		expect(userSubmitEvents.length).toBeGreaterThan(0);
		expect(harnessMessageRoles.length).toBeGreaterThan(0);
		expect(
			harnessMessageRoles.every((role) => role === "assistant"),
		).toBeTrue();
	});
});
