import { z } from "zod";

/**
 * Git status for a worktree
 */
export const gitStatusSchema = z.object({
	branch: z.string(),
	needsRebase: z.boolean(),
	ahead: z.number().optional(),
	behind: z.number().optional(),
	lastRefreshed: z.number(),
});

export type GitStatus = z.infer<typeof gitStatusSchema>;

/**
 * GitHub check item
 */
export const checkItemSchema = z.object({
	name: z.string(),
	status: z.enum(["success", "failure", "pending", "skipped", "cancelled"]),
	url: z.string().optional(),
	durationText: z.string().optional(),
});

export type CheckItem = z.infer<typeof checkItemSchema>;

export const pullRequestCommentSchema = z.object({
	id: z.string(),
	authorLogin: z.string(),
	avatarUrl: z.string().optional(),
	body: z.string(),
	createdAt: z.number().optional(),
	url: z.string().optional(),
	kind: z.enum(["review", "conversation"]).optional(),
	path: z.string().optional(),
	line: z.number().optional(),
	isResolved: z.boolean().optional(),
});

export type PullRequestComment = z.infer<typeof pullRequestCommentSchema>;

/**
 * GitHub PR status
 */
export const gitHubStatusSchema = z.object({
	pr: z
		.object({
			number: z.number(),
			title: z.string(),
			url: z.string(),
			state: z.enum(["open", "draft", "merged", "closed", "queued"]),
			mergedAt: z.number().optional(),
			additions: z.number(),
			deletions: z.number(),
			headRefName: z.string().optional(),
			headRepositoryOwner: z.string().optional(),
			headRepositoryName: z.string().optional(),
			isCrossRepository: z.boolean().optional(),
			reviewDecision: z.enum(["approved", "changes_requested", "pending"]),
			checksStatus: z.enum(["success", "failure", "pending", "none"]),
			checks: z.array(checkItemSchema),
			comments: z.array(pullRequestCommentSchema).optional(),
			requestedReviewers: z.array(z.string()).optional(),
		})
		.nullable(),
	repoUrl: z.string(),
	upstreamUrl: z.string().optional(),
	isFork: z.boolean().optional(),
	branchExistsOnRemote: z.boolean(),
	previewUrl: z.string().optional(),
	lastRefreshed: z.number(),
});

export type GitHubStatus = z.infer<typeof gitHubStatusSchema>;

export const EXECUTION_MODES = [
	"split-pane",
	"new-tab",
	"new-tab-split-pane",
] as const;

export type ExecutionMode = (typeof EXECUTION_MODES)[number];

export function normalizeExecutionMode(mode: unknown): ExecutionMode {
	if (
		mode === "split-pane" ||
		mode === "new-tab" ||
		mode === "new-tab-split-pane"
	) {
		return mode;
	}

	if (mode === "parallel" || mode === "sequential") {
		return "split-pane";
	}

	return "new-tab";
}

/**
 * Terminal preset
 */
export const terminalPresetSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().optional(),
	cwd: z.string(),
	commands: z.array(z.string()),
	projectIds: z.array(z.string()).nullable().optional(),
	pinnedToBar: z.boolean().optional(),
	applyOnWorkspaceCreated: z.boolean().optional(),
	applyOnNewTab: z.boolean().optional(),
	executionMode: z.enum(EXECUTION_MODES).optional(),
});

export type TerminalPreset = z.infer<typeof terminalPresetSchema>;

export const AGENT_PRESET_FIELDS = [
	"enabled",
	"label",
	"description",
	"command",
	"promptCommand",
	"promptCommandSuffix",
	"taskPromptTemplate",
	"model",
] as const;

export type AgentPresetField = (typeof AGENT_PRESET_FIELDS)[number];

export const agentPresetOverrideSchema = z.object({
	id: z.string(),
	enabled: z.boolean().optional(),
	label: z.string().optional(),
	description: z.string().nullable().optional(),
	command: z.string().optional(),
	promptCommand: z.string().optional(),
	promptCommandSuffix: z.string().nullable().optional(),
	taskPromptTemplate: z.string().optional(),
	model: z.string().optional(),
});

export type AgentPresetOverride = z.infer<typeof agentPresetOverrideSchema>;

export const agentPresetOverrideEnvelopeSchema = z.object({
	version: z.literal(1),
	presets: z.array(agentPresetOverrideSchema),
});

export type AgentPresetOverrideEnvelope = z.infer<
	typeof agentPresetOverrideEnvelopeSchema
>;

export const agentCustomDefinitionSchema = z.object({
	id: z.string().regex(/^custom:/),
	kind: z.literal("terminal"),
	label: z.string(),
	description: z.string().optional(),
	command: z.string(),
	promptCommand: z.string(),
	promptCommandSuffix: z.string().optional(),
	taskPromptTemplate: z.string(),
	enabled: z.boolean().optional(),
});

export type AgentCustomDefinition = z.infer<typeof agentCustomDefinitionSchema>;

/**
 * Workspace type
 */
export const workspaceTypeSchema = z.enum(["worktree", "branch"]);

export type WorkspaceType = z.infer<typeof workspaceTypeSchema>;

/**
 * External apps that can be opened
 */
export const EXTERNAL_APPS = [
	"finder",
	"vscode",
	"vscode-insiders",
	"cursor",
	"antigravity",
	"windsurf",
	"zed",
	"sublime",
	"xcode",
	"iterm",
	"warp",
	"terminal",
	"ghostty",
	// JetBrains IDEs
	"intellij",
	"webstorm",
	"pycharm",
	"phpstorm",
	"rubymine",
	"goland",
	"clion",
	"rider",
	"datagrip",
	"appcode",
	"fleet",
	"rustrover",
	"android-studio",
] as const;

export type ExternalApp = (typeof EXTERNAL_APPS)[number];

/** Apps that are not editors/IDEs and should not be set as the global default editor. */
export const NON_EDITOR_APPS: readonly ExternalApp[] = [
	"finder",
	"iterm",
	"warp",
	"terminal",
	"ghostty",
] as const;

/**
 * Terminal link behavior options
 */
export const TERMINAL_LINK_BEHAVIORS = [
	"external-editor",
	"file-viewer",
] as const;

export type TerminalLinkBehavior = (typeof TERMINAL_LINK_BEHAVIORS)[number];

/**
 * Branch prefix modes for workspace branch naming
 */
export const BRANCH_PREFIX_MODES = [
	"none",
	"github",
	"author",
	"custom",
] as const;

export type BranchPrefixMode = (typeof BRANCH_PREFIX_MODES)[number];

export const FILE_OPEN_MODES = ["split-pane", "new-tab"] as const;

export type FileOpenMode = (typeof FILE_OPEN_MODES)[number];
