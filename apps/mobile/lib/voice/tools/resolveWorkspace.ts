import type { VoiceSessionRow, VoiceWorkspace } from "./types";

export type WorkspaceResolution =
	| { kind: "match"; workspace: VoiceWorkspace }
	| { kind: "ambiguous"; candidates: VoiceWorkspace[] }
	| { kind: "none" };

const normalize = (value: string) =>
	value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();

const tokens = (value: string) => normalize(value).split(" ").filter(Boolean);

/** Higher is better; 0 is no relation. */
function score(query: string, workspace: VoiceWorkspace): number {
	if (query === workspace.id) return 100;
	const name = normalize(workspace.name);
	const q = normalize(query);
	if (!q) return 0;
	if (name === q) return 90;
	if (name.startsWith(q)) return 70;
	if (name.includes(q)) return 60;
	const nameTokens = tokens(workspace.name);
	const queryTokens = tokens(query);
	const hits = queryTokens.filter((token) =>
		nameTokens.some((candidate) => candidate.startsWith(token)),
	).length;
	if (hits === queryTokens.length) return 50;
	if (hits > 0) return 20 + hits;
	// Spoken names lose their punctuation: "authrefactor" for "auth-refactor".
	if (name.replace(/ /g, "").includes(q.replace(/ /g, ""))) return 40;
	return 0;
}

const recency = (workspace: VoiceWorkspace) =>
	workspace.attentionAt ?? workspace.lastActivityAt ?? 0;

/**
 * What the user meant by "the auth one". One clear winner is a match; several
 * at the same strength are ambiguous and the model is told to ask.
 */
export function resolveWorkspace(
	query: string,
	workspaces: VoiceWorkspace[],
): WorkspaceResolution {
	const scored = workspaces
		.map((workspace) => ({ workspace, score: score(query, workspace) }))
		.filter((entry) => entry.score > 0)
		.sort(
			(left, right) =>
				right.score - left.score ||
				recency(right.workspace) - recency(left.workspace),
		);
	if (scored.length === 0) return { kind: "none" };
	const [best, next] = scored;
	if (!best) return { kind: "none" };
	if (best.score >= 90 || !next || next.score < best.score) {
		return { kind: "match", workspace: best.workspace };
	}
	return {
		kind: "ambiguous",
		candidates: scored
			.filter((entry) => entry.score === best.score)
			.map((entry) => entry.workspace)
			.slice(0, 5),
	};
}

/** By agent ("claude"), title, or id; otherwise the most recently active. */
export function resolveSession(
	query: string | undefined,
	sessions: VoiceSessionRow[],
): VoiceSessionRow | null {
	if (sessions.length === 0) return null;
	const byActivity = [...sessions].sort(
		(left, right) =>
			(right.lastEventAt ?? right.createdAt) -
			(left.lastEventAt ?? left.createdAt),
	);
	if (!query) return byActivity[0] ?? null;
	const q = normalize(query);
	return (
		byActivity.find((session) => session.terminalId === query) ??
		byActivity.find((session) => normalize(session.title) === q) ??
		byActivity.find(
			(session) => session.agentId && normalize(session.agentId) === q,
		) ??
		byActivity.find((session) => normalize(session.title).includes(q)) ??
		byActivity.find(
			(session) => session.agentId && normalize(session.agentId).includes(q),
		) ??
		null
	);
}
