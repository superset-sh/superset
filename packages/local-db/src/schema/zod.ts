import { z } from "zod";

export const gitStatusSchema = z.object({
	branch: z.string(),
	needsRebase: z.boolean(),
	lastRefreshed: z.number(),
});

export type GitStatus = z.infer<typeof gitStatusSchema>;

export const checkItemSchema = z.object({
	name: z.string(),
	status: z.enum(["success", "failure", "pending", "skipped", "cancelled"]),
	url: z.string().optional(),
});

export type CheckItem = z.infer<typeof checkItemSchema>;

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
			reviewDecision: z.enum(["approved", "changes_requested", "pending"]),
			checksStatus: z.enum(["success", "failure", "pending", "none"]),
			checks: z.array(checkItemSchema),
		})
		.nullable(),
	repoUrl: z.string(),
	branchExistsOnRemote: z.boolean(),
	lastRefreshed: z.number(),
});

export type GitHubStatus = z.infer<typeof gitHubStatusSchema>;

export const EXECUTION_MODES = ["sequential", "parallel"] as const;

export type ExecutionMode = (typeof EXECUTION_MODES)[number];

export const terminalPresetSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().optional(),
	cwd: z.string(),
	commands: z.array(z.string()),
	isDefault: z.boolean().optional(),
	applyOnWorkspaceCreated: z.boolean().optional(),
	applyOnNewTab: z.boolean().optional(),
	executionMode: z.enum(EXECUTION_MODES).optional(),
});

export type TerminalPreset = z.infer<typeof terminalPresetSchema>;

export const workspaceTypeSchema = z.enum(["worktree", "branch"]);

export type WorkspaceType = z.infer<typeof workspaceTypeSchema>;

export const EXTERNAL_APPS = [
	"finder",
	"vscode",
	"vscode-insiders",
	"cursor",
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
] as const;

export type ExternalApp = (typeof EXTERNAL_APPS)[number];

export const TERMINAL_LINK_BEHAVIORS = [
	"external-editor",
	"file-viewer",
] as const;

export type TerminalLinkBehavior = (typeof TERMINAL_LINK_BEHAVIORS)[number];

export const BRANCH_PREFIX_MODES = [
	"none",
	"github",
	"author",
	"custom",
] as const;

export type BranchPrefixMode = (typeof BRANCH_PREFIX_MODES)[number];
