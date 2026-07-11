/**
 * Shared vocabulary for the Agents & Skills library: Claude Code definition
 * files (subagents in `agents/*.md`, skills in `skills/<name>/SKILL.md`)
 * managed by scope on a host.
 *
 * - user scope: `~/.claude` — applies to every project on the host
 * - project scope: a registered project's repo (`.claude/` and `.agents/` dirs)
 *
 * Frontmatter value sets follow Claude Code docs (2026-07). Model validation
 * stays permissive on purpose: brand-new model ids must work the day they
 * ship — that churn is the reason this feature exists.
 */

export type DefinitionKind = "agent" | "skill";

export type AgentLibraryScope =
	| { kind: "user" }
	| { kind: "project"; projectId: string };

/** Wire encoding of a scope: `"user"` or `"project:<projectId>"`. */
export type ScopeKey = string;

export const USER_SCOPE_KEY = "user";

export function encodeScopeKey(scope: AgentLibraryScope): ScopeKey {
	return scope.kind === "user" ? USER_SCOPE_KEY : `project:${scope.projectId}`;
}

export function parseScopeKey(scopeKey: ScopeKey): AgentLibraryScope | null {
	if (scopeKey === USER_SCOPE_KEY) return { kind: "user" };
	if (scopeKey.startsWith("project:")) {
		const projectId = scopeKey.slice("project:".length);
		if (projectId.length > 0) return { kind: "project", projectId };
	}
	return null;
}

export interface DefinitionRef {
	scopeKey: ScopeKey;
	kind: DefinitionKind;
	name: string;
}

export interface DefinitionSummary extends DefinitionRef {
	description: string;
	/** Agent frontmatter `model:`; null when unset (inherit). */
	model: string | null;
	/** Agent frontmatter `effort:`; null when unset. */
	effort: string | null;
	/** Path relative to the scope root, e.g. `agents/worker.md`. Display only. */
	relativePath: string;
	/** Epoch millis of last modification, when known. */
	updatedAt: number | null;
}

export interface DefinitionDetail extends DefinitionSummary {
	/** Parsed frontmatter map, unknown keys included. */
	frontmatter: Record<string, unknown>;
	/** Markdown body after the frontmatter block. */
	body: string;
	/** Entire file content. */
	raw: string;
	/** Optimistic-concurrency token; pass back as `expectedRevision` on save. */
	revision: string;
}

/** Claude Code `model:` aliases. Any other non-empty string (a full model id) is also valid. */
export const AGENT_MODEL_ALIASES = [
	"inherit",
	"sonnet",
	"opus",
	"haiku",
	"fable",
] as const;

/** Claude Code `effort:` levels. */
export const AGENT_EFFORT_LEVELS = [
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
] as const;

/**
 * Names we accept when addressing an existing definition. Blocks path
 * separators, leading dots, and `..` so a ref can never traverse out of its
 * scope directory, while still matching real-world files.
 */
export const DEFINITION_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Stricter shape for newly created definitions (Claude Code convention). */
export const NEW_DEFINITION_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function isValidDefinitionName(name: string): boolean {
	return DEFINITION_NAME_PATTERN.test(name) && !name.includes("..");
}
