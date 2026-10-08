import { describe, expect, test } from "bun:test";
import type { TimelineEntry } from "@superset/chat/core";
import type { AgentMessage, ToolCall } from "@superset/chat/protocol";
import { pageLinkFinder } from "../../../../utils/pageLinks";
import { turnPageLinks } from "./turnPageLinks";

const WEB_URL = "https://app.superset.sh";
const REPORT = `${WEB_URL}/page/quarterly-report-a3f9k`;
const PLAN = `${WEB_URL}/page/launch-plan-b7c2d`;
const find = pageLinkFinder(WEB_URL);

let clock = 0;

function message(id: string, text: string): TimelineEntry {
	const item: AgentMessage = {
		id,
		kind: "agent_message",
		text,
		startedAtMs: ++clock,
		completedAtMs: clock,
	};
	return { kind: "item", item };
}

function tool(
	id: string,
	output: string,
	status: ToolCall["status"] = "completed",
): ToolCall {
	return {
		id,
		kind: "tool_call",
		title: "superset pages publish report.html",
		toolKind: "execute",
		toolName: "execute",
		status,
		content: [{ type: "text", text: output }],
		startedAtMs: ++clock,
	};
}

function toolSlugs(
	entries: TimelineEntry[],
	settled = true,
): Record<string, string[]> {
	return Object.fromEntries(
		[...turnPageLinks(entries, settled, find).fromTools].map(([id, links]) => [
			id,
			links.map((link) => link.slug),
		]),
	);
}

describe("turnPageLinks", () => {
	test("a page only a tool call printed shows under that call", () => {
		expect(
			toolSlugs([
				{ kind: "item", item: tool("t1", `Published ${REPORT}\n`) },
				message("a1", "Done."),
			]),
		).toEqual({ t1: ["quarterly-report-a3f9k"] });
	});

	test("a page the reply links shows under the reply, not the tool call", () => {
		const links = turnPageLinks(
			[
				{
					kind: "tool_run",
					items: [tool("t1", "ok"), tool("t2", `${REPORT}\n${PLAN}\n`)],
				},
				message("a1", `Here is the report: ${REPORT}`),
			],
			true,
			find,
		);
		expect([...links.fromTools]).toEqual([
			["t2", [{ slug: "launch-plan-b7c2d", url: PLAN }]],
		]);
	});

	test("nothing shows under a tool call while the turn runs", () => {
		expect(
			toolSlugs([{ kind: "item", item: tool("t1", REPORT) }], false),
		).toEqual({});
	});

	test("a call still running shows nothing", () => {
		expect(
			toolSlugs([{ kind: "item", item: tool("t1", REPORT, "running") }]),
		).toEqual({});
	});

	test("two calls that print the same page show it once", () => {
		expect(
			toolSlugs([
				{ kind: "tool_run", items: [tool("t1", REPORT), tool("t2", REPORT)] },
			]),
		).toEqual({ t1: ["quarterly-report-a3f9k"] });
	});

	test("a listing of pages shows no cards", () => {
		const listing = ["a", "b", "c", "d"]
			.map((name) => `${WEB_URL}/page/${name}-00000`)
			.join("\n");
		expect(toolSlugs([{ kind: "item", item: tool("t1", listing) }])).toEqual(
			{},
		);
	});

	test("a later message is told which pages an earlier one already shows", () => {
		const links = turnPageLinks(
			[
				message("a1", `Report: ${REPORT}`),
				message("a2", `Plan: ${PLAN}`),
				message("a3", `Both: ${REPORT} ${PLAN}`),
			],
			false,
			find,
		);
		expect([...links.shownEarlier]).toEqual([
			["a2", "quarterly-report-a3f9k"],
			["a3", "quarterly-report-a3f9k launch-plan-b7c2d"],
		]);
	});
});
