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
	threadId: z.string().optional(),
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
			state: z.enum(["open", "draft", "merged", "closed"]),
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
	"sequential",
] as const;

export type ExecutionMode = (typeof EXECUTION_MODES)[number];

export function normalizeExecutionMode(mode: unknown): ExecutionMode {
	if (
		mode === "split-pane" ||
		mode === "new-tab" ||
		mode === "new-tab-split-pane" ||
		mode === "sequential"
	) {
		return mode;
	}

	if (mode === "parallel") {
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
	useAsWorkspaceRun: z.boolean().optional(),
	applyOnWorkspaceCreated: z.boolean().optional(),
	applyOnNewTab: z.boolean().optional(),
	executionMode: z.enum(EXECUTION_MODES).optional(),
	/**
	 * One-shot bridge for scripts authored by the CLI. V2 copies the row into
	 * its renderer collection, then clears this marker in the shared legacy
	 * store. Older desktop builds ignore the extra JSON field and still show
	 * the script normally.
	 */
	cliImportPending: z.boolean().optional(),
	/** Organization-scoped destination for the v2 one-shot import. */
	cliTargetOrganizationId: z.string().optional(),
});

export type TerminalPreset = z.infer<typeof terminalPresetSchema>;

export {
	AGENT_PRESET_FIELDS,
	type AgentCustomDefinition,
	type AgentPresetField,
	type AgentPresetOverride,
	type AgentPresetOverrideEnvelope,
	agentCustomDefinitionSchema,
	agentPresetOverrideEnvelopeSchema,
	agentPresetOverrideSchema,
} from "@superset/shared/agent-custom";
export {
	PROMPT_TRANSPORTS,
	type PromptTransport,
} from "@superset/shared/agent-prompt-launch";

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
	"devin",
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
 * User-defined apps live in a separate `custom:<id>` namespace rather than
 * widening `ExternalApp`. `EXTERNAL_APPS` stays a closed union so the
 * exhaustive `Record<ExternalApp, ...>` command tables keep failing to compile
 * when a built-in app is added — a custom app can never silently fall through
 * them. Use `AppRef` wherever an app id crosses a boundary (IPC, storage).
 */
export const CUSTOM_APP_ID_PREFIX = "custom:";

export type CustomAppId = `${typeof CUSTOM_APP_ID_PREFIX}${string}`;

/** Either a built-in app or a user-defined one. */
export type AppRef = ExternalApp | CustomAppId;

export function isCustomAppId(id: string): id is CustomAppId {
	return id.startsWith(CUSTOM_APP_ID_PREFIX);
}

const CUSTOM_APP_ID_PATTERN = /^custom:[A-Za-z0-9_-]+$/;

/**
 * `z.custom` rather than `z.string().regex(...)` so the inferred type is the
 * `custom:${string}` template literal, not `string` — that keeps `AppRef`
 * assignable to the `$type<AppRef>()` columns without casts at the call sites.
 */
export const customAppIdSchema = z.custom<CustomAppId>(
	(value) => typeof value === "string" && CUSTOM_APP_ID_PATTERN.test(value),
	{ message: "Custom app ids look like custom:<alphanumeric>" },
);

/**
 * A user-defined external app. At least one of `appName`/`bundleId` is
 * required — both feed macOS `open` (`-a <appName>` / `-b <bundleId>`), and
 * `appName` doubles as the binary to spawn on Linux.
 */
const customAppFieldsSchema = z.object({
	id: customAppIdSchema,
	/** Menu label. */
	label: z.string().trim().min(1).max(60),
	/** macOS `.app` display name, e.g. "Xcode-26.5.0". Linux: binary name. */
	appName: z.string().trim().min(1).max(200).optional(),
	/** macOS bundle id, e.g. "com.apple.dt.Xcode". Preferred over appName. */
	bundleId: z.string().trim().min(1).max(200).optional(),
});

const hasIdentifier = (app: { appName?: string; bundleId?: string }) =>
	Boolean(app.appName || app.bundleId);
const identifierParams = {
	message: "Provide an app name or a bundle id",
	path: ["appName"],
};

export const customAppSchema = customAppFieldsSchema.refine(
	hasIdentifier,
	identifierParams,
);

/**
 * Create/update payload: everything but the server-assigned id. Derived from
 * the unrefined object because zod 4 rejects `.omit()` on a refined schema at
 * construction time, which would take the whole settings router down.
 */
export const customAppInputSchema = customAppFieldsSchema
	.omit({ id: true })
	.refine(hasIdentifier, identifierParams);

export type CustomApp = z.infer<typeof customAppSchema>;

/** Validates any app id crossing a boundary: built-in or `custom:<id>`. */
export const appRefSchema = z.union([z.enum(EXTERNAL_APPS), customAppIdSchema]);

/**
 * Terminal link behavior options
 */
export const TERMINAL_LINK_BEHAVIORS = [
	"external-editor",
	"file-viewer",
] as const;

export type TerminalLinkBehavior = (typeof TERMINAL_LINK_BEHAVIORS)[number];

export {
	BRANCH_PREFIX_MODES,
	type BranchPrefixMode,
} from "@superset/shared/workspace-launch";

export const FILE_OPEN_MODES = ["split-pane", "new-tab"] as const;

export type FileOpenMode = (typeof FILE_OPEN_MODES)[number];
