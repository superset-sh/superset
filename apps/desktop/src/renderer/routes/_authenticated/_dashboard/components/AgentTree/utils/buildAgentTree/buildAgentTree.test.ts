import { describe, expect, it } from "bun:test";
import {
	type AgentTreeSubagentInput,
	buildAgentTree,
	flattenAgentTree,
} from "./buildAgentTree";

const child = (
	id: string,
	extra: Partial<AgentTreeSubagentInput> = {},
): AgentTreeSubagentInput => ({
	id,
	status: "working",
	startedAt: 1,
	...extra,
});

const root = (
	subagents: AgentTreeSubagentInput[],
	ended?: AgentTreeSubagentInput[],
) => ({
	terminalId: "t1",
	agentId: "claude",
	title: "Claude",
	status: "working" as const,
	startedAt: 0,
	subagents,
	...(ended ? { endedSubagents: ended } : {}),
});

describe("buildAgentTree", () => {
	it("omits the agent row for a single root and nests by parent pointer", () => {
		const tree = buildAgentTree([
			root([
				child("a"),
				child("b", { parentSubagentId: "a" }),
				child("c", { parentSubagentId: "b" }),
				child("d"),
			]),
		]);
		expect(tree.live.map((n) => [n.subagentId, n.depth])).toEqual([
			["a", 0],
			["d", 0],
		]);
		expect(tree.live[0]?.children[0]?.subagentId).toBe("b");
		expect(tree.live[0]?.children[0]?.depth).toBe(1);
		expect(tree.live[0]?.children[0]?.children[0]?.subagentId).toBe("c");
		expect(tree.live[0]?.children[0]?.children[0]?.depth).toBe(2);
	});

	it("adds an agent node per root when there are several", () => {
		const tree = buildAgentTree([
			root([child("a")]),
			{ ...root([]), terminalId: "t2", title: "Codex" },
		]);
		expect(tree.live.map((n) => [n.kind, n.title, n.depth])).toEqual([
			["agent", "Claude", 0],
			["agent", "Codex", 0],
		]);
		expect(tree.live[0]?.children[0]?.depth).toBe(1);
	});

	it("re-roots a child whose parent is not in the roster", () => {
		const tree = buildAgentTree([
			root([child("a", { parentSubagentId: "gone" })]),
		]);
		expect(tree.live.map((n) => n.subagentId)).toEqual(["a"]);
		expect(tree.live[0]?.depth).toBe(0);
	});

	it("breaks a cycle without dropping either node", () => {
		const tree = buildAgentTree([
			root([
				child("a", { parentSubagentId: "b" }),
				child("b", { parentSubagentId: "a" }),
			]),
		]);
		expect(
			flattenAgentTree(tree.live)
				.map((n) => n.subagentId)
				.sort(),
		).toEqual(["a", "b"]);
	});

	it("titles a child by description, then type, then id, keeping the type as subtitle", () => {
		const tree = buildAgentTree([
			root([
				child("a", { description: "Find callers", agentType: "Explore" }),
				child("b", { agentType: "Explore" }),
				child("c"),
			]),
		]);
		expect(tree.live.map((n) => [n.title, n.subtitle])).toEqual([
			["Find callers", "Explore"],
			["Explore", undefined],
			["c", undefined],
		]);
	});

	it("lists ended children flat, oldest ended first", () => {
		const tree = buildAgentTree([
			root(
				[],
				[
					child("late", { status: "completed", endedAt: 20 }),
					child("early", { status: "completed", endedAt: 10 }),
				],
			),
		]);
		expect(tree.ended.map((n) => n.subagentId)).toEqual(["early", "late"]);
		expect(tree.ended[0]?.depth).toBe(0);
	});

	it("keeps an ended parent in the live tree while a child still runs", () => {
		const tree = buildAgentTree([
			root(
				[child("grandchild", { parentSubagentId: "parent" })],
				[
					child("parent", { status: "completed", endedAt: 5 }),
					child("done", { status: "completed", endedAt: 6 }),
				],
			),
		]);
		expect(tree.live.map((n) => [n.subagentId, n.endedAt])).toEqual([
			["parent", 5],
		]);
		expect(tree.live[0]?.children[0]?.subagentId).toBe("grandchild");
		expect(tree.ended.map((n) => n.subagentId)).toEqual(["done"]);
	});

	it("marks a child the harness could not place", () => {
		const tree = buildAgentTree([root([child("a", { parentUnknown: true })])]);
		expect(tree.live[0]?.parentUnknown).toBe(true);
	});
});
