import type { AgentDefinitionId } from "@superset/shared/agent-catalog";
import type { ResolvedAgentConfig } from "@superset/shared/agent-settings";

/**
 * Discriminated union of every kind of source that can contribute context
 * to a workspace launch. Extending this is the first step to adding a new
 * source (e.g. Linear tickets, Notion pages): add a variant, add a
 * contributor, register it.
 */
export type LaunchSource =
	| { kind: "user-prompt"; content: ContentPart[] }
	| { kind: "github-issue"; url: string }
	| { kind: "github-pr"; url: string }
	| { kind: "internal-task"; id: string }
	| { kind: "attachment"; file: AttachmentFile };

export type LaunchSourceKind = LaunchSource["kind"];

/**
 * An attachment carried through composition. Stored as raw bytes — not
 * base64 — so we skip the 33% overhead internally. Base64 encoding happens
 * only at the chat provider API boundary.
 */
export interface AttachmentFile {
	data: Uint8Array;
	mediaType: string;
	filename?: string;
}

/**
 * AI SDK v3 / Anthropic-aligned content part. A section's content is
 * always an array so text, files, and images can coexist without
 * flattening.
 */
export type ContentPart =
	| { type: "text"; text: string }
	| {
			type: "file";
			data: Uint8Array;
			mediaType: string;
			filename?: string;
	  }
	| { type: "image"; data: Uint8Array; mediaType: string };

/**
 * A resolved contribution from a single source. Every contributor
 * produces one of these (or null on non-fatal failure).
 */
export interface ContextSection {
	id: string; // stable, e.g. "issue:123"
	kind: LaunchSourceKind;
	label: string;
	content: ContentPart[];
	meta?: {
		taskSlug?: string;
		url?: string;
	};
}

/**
 * Collaborators handed to every contributor. Kept small and explicit —
 * contributors should not reach into globals.
 */
export interface ResolveCtx {
	projectId: string;
	signal: AbortSignal;
	fetchIssue: (url: string) => Promise<GitHubIssueContent>;
	fetchPullRequest: (url: string) => Promise<GitHubPullRequestContent>;
	fetchInternalTask: (id: string) => Promise<InternalTaskContent>;
}

export interface GitHubIssueContent {
	number: number;
	url: string;
	title: string;
	body: string; // already sanitized and truncated
	slug: string;
}

export interface GitHubPullRequestContent {
	number: number;
	url: string;
	title: string;
	body: string;
	branch: string;
}

export interface InternalTaskContent {
	id: string;
	slug: string;
	title: string;
	description: string | null;
}

/**
 * A contributor resolves one kind of LaunchSource into a ContextSection.
 * Metadata (displayName/description/requiresQuery) is lifted from
 * Continue.dev's context provider interface for future UI rendering.
 */
export interface ContextContributor<S extends LaunchSource = LaunchSource> {
	kind: S["kind"];
	displayName: string;
	description: string;
	requiresQuery: boolean;
	resolve(source: S, ctx: ResolveCtx): Promise<ContextSection | null>;
}

export type ContributorRegistry = {
	readonly [K in LaunchSourceKind]: ContextContributor<
		Extract<LaunchSource, { kind: K }>
	>;
};

/**
 * Composer output. Agent-agnostic: feeds into any consumer
 * (buildLaunchSpec, buildBranchNameContext, renderLaunchPreview, ...).
 */
export interface LaunchContext {
	projectId: string;
	sources: LaunchSource[];
	sections: ContextSection[];
	failures: Array<{ source: LaunchSource; error: string }>;
	taskSlug?: string;
	agent: {
		id: AgentDefinitionId | "none";
		config?: ResolvedAgentConfig;
	};
}

/**
 * V2-native launch spec. Replaces the V1 `AgentLaunchRequest` shape
 * (which flattened prompt to a single string). Maps cleanly to:
 *   - Anthropic Messages API: system blocks + user content parts.
 *   - AI SDK v3: ModelMessage with ContentPart[].
 *   - Terminal adapters: flatten system+user to prompt text, write
 *     attachments to .superset/attachments/, reference by path.
 */
export interface AgentLaunchSpec {
	agentId: AgentDefinitionId;
	system: ContentPart[];
	user: ContentPart[];
	attachments: ContentPart[];
	taskSlug?: string;
}

/**
 * Inputs passed to buildLaunchContext. Contributors, resolvers, and
 * timeout are passed as collaborators via ResolveCtx / options.
 */
export interface BuildLaunchContextInputs {
	projectId: string;
	sources: LaunchSource[];
	agent: LaunchContext["agent"];
}
