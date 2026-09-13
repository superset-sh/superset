export type AgentTreeNodeStatus =
	| "idle"
	| "working"
	| "waiting"
	| "review"
	| "completed"
	| "failed"
	| "stopped";

export interface AgentTreeActivity {
	toolName: string;
	summary: string;
	at: number;
}

/** One subagent as the tree receives it from a terminal agent binding. */
export interface AgentTreeSubagentInput {
	id: string;
	agentType?: string;
	description?: string;
	parentSubagentId?: string;
	parentUnknown?: boolean;
	status: AgentTreeNodeStatus;
	activity?: AgentTreeActivity;
	startedAt: number;
	endedAt?: number;
}

export interface AgentTreeRootInput {
	terminalId: string;
	/** Agent identity id (`claude`, `codex`, …), which picks the row icon. */
	agentId: string;
	title: string;
	status: AgentTreeNodeStatus;
	startedAt: number;
	subagents: readonly AgentTreeSubagentInput[];
	endedSubagents?: readonly AgentTreeSubagentInput[];
}

export interface AgentTreeNode {
	key: string;
	kind: "agent" | "subagent";
	terminalId: string;
	agentId?: string;
	subagentId?: string;
	title: string;
	subtitle?: string;
	status: AgentTreeNodeStatus;
	activity?: AgentTreeActivity;
	startedAt: number;
	endedAt?: number;
	/** No harness evidence placed this child; it sits at its parent's level with a dashed rail. */
	parentUnknown: boolean;
	depth: number;
	children: AgentTreeNode[];
}

export interface AgentTreeData {
	live: AgentTreeNode[];
	ended: AgentTreeNode[];
}

function subagentNode(
	terminalId: string,
	subagent: AgentTreeSubagentInput,
	depth: number,
): AgentTreeNode {
	const title = subagent.description ?? subagent.agentType ?? subagent.id;
	return {
		key: `subagent:${terminalId}:${subagent.id}`,
		kind: "subagent",
		terminalId,
		subagentId: subagent.id,
		title,
		...(subagent.description && subagent.agentType
			? { subtitle: subagent.agentType }
			: {}),
		status: subagent.status,
		...(subagent.activity ? { activity: subagent.activity } : {}),
		startedAt: subagent.startedAt,
		...(subagent.endedAt !== undefined ? { endedAt: subagent.endedAt } : {}),
		parentUnknown: subagent.parentUnknown === true,
		depth,
		children: [],
	};
}

/**
 * Nest a flat roster by `parentSubagentId`. A child whose parent is missing
 * from the roster re-roots under the agent; a cycle is broken at the first
 * repeated id so a bad pointer can never hide a branch.
 */
function nestSubagents(
	terminalId: string,
	subagents: readonly AgentTreeSubagentInput[],
	baseDepth: number,
): AgentTreeNode[] {
	const byId = new Map(subagents.map((subagent) => [subagent.id, subagent]));
	const childrenOf = new Map<string | undefined, AgentTreeSubagentInput[]>();
	for (const subagent of subagents) {
		const parentId =
			subagent.parentSubagentId !== undefined &&
			byId.has(subagent.parentSubagentId) &&
			subagent.parentSubagentId !== subagent.id
				? subagent.parentSubagentId
				: undefined;
		const siblings = childrenOf.get(parentId) ?? [];
		siblings.push(subagent);
		childrenOf.set(parentId, siblings);
	}

	const emitted = new Set<string>();
	const build = (
		parentId: string | undefined,
		depth: number,
	): AgentTreeNode[] => {
		const siblings = childrenOf.get(parentId) ?? [];
		const nodes: AgentTreeNode[] = [];
		for (const subagent of siblings) {
			if (emitted.has(subagent.id)) continue;
			emitted.add(subagent.id);
			const node = subagentNode(terminalId, subagent, depth);
			node.children = build(subagent.id, depth + 1);
			nodes.push(node);
		}
		return nodes;
	};

	const roots = build(undefined, baseDepth);
	for (const subagent of subagents) {
		if (emitted.has(subagent.id)) continue;
		emitted.add(subagent.id);
		const node = subagentNode(terminalId, subagent, baseDepth);
		node.children = build(subagent.id, baseDepth + 1);
		roots.push(node);
	}
	return roots;
}

/**
 * A parent that finished while its children still run stays in the live
 * tree, dimmed, so the branch keeps its shape; only ended children with no
 * live descendants go to the ended list.
 */
function keepLiveAncestors(
	live: readonly AgentTreeSubagentInput[],
	ended: readonly AgentTreeSubagentInput[],
): { live: AgentTreeSubagentInput[]; ended: AgentTreeSubagentInput[] } {
	const endedById = new Map(ended.map((subagent) => [subagent.id, subagent]));
	const promoted = new Map<string, AgentTreeSubagentInput>();
	const climb = (subagent: AgentTreeSubagentInput) => {
		let parentId = subagent.parentSubagentId;
		while (parentId !== undefined && !promoted.has(parentId)) {
			const parent = endedById.get(parentId);
			if (!parent) break;
			promoted.set(parentId, parent);
			parentId = parent.parentSubagentId;
		}
	};
	for (const subagent of live) climb(subagent);
	return {
		live: [...live, ...promoted.values()],
		ended: ended.filter((subagent) => !promoted.has(subagent.id)),
	};
}

/**
 * The tree for one or more terminal agents. With a single root the agent
 * row is omitted and its children sit at depth 0; with several, each agent
 * is a depth-0 node. Ended children are listed separately, flat, oldest
 * ended first.
 */
export function buildAgentTree(
	roots: readonly AgentTreeRootInput[],
): AgentTreeData {
	const single = roots.length === 1;
	const live: AgentTreeNode[] = [];
	const ended: AgentTreeNode[] = [];
	for (const root of roots) {
		const { live: liveSubagents, ended: endedSubagents } = keepLiveAncestors(
			root.subagents,
			root.endedSubagents ?? [],
		);
		const children = nestSubagents(
			root.terminalId,
			liveSubagents,
			single ? 0 : 1,
		);
		if (single) {
			live.push(...children);
		} else {
			live.push({
				key: `agent:${root.terminalId}`,
				kind: "agent",
				terminalId: root.terminalId,
				agentId: root.agentId,
				title: root.title,
				status: root.status,
				startedAt: root.startedAt,
				parentUnknown: false,
				depth: 0,
				children,
			});
		}
		for (const subagent of endedSubagents) {
			ended.push(subagentNode(root.terminalId, subagent, 0));
		}
	}
	ended.sort((a, b) => (a.endedAt ?? 0) - (b.endedAt ?? 0));
	return { live, ended };
}

export function flattenAgentTree(
	nodes: readonly AgentTreeNode[],
): AgentTreeNode[] {
	const out: AgentTreeNode[] = [];
	const walk = (list: readonly AgentTreeNode[]) => {
		for (const node of list) {
			out.push(node);
			walk(node.children);
		}
	};
	walk(nodes);
	return out;
}

export function countAgentTreeNodes(nodes: readonly AgentTreeNode[]): number {
	return flattenAgentTree(nodes).length;
}
