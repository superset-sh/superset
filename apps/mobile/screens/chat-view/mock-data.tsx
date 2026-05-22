import { FileCode, FileSearch, Hammer } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import type { ChatThreadItem } from "./types";

/**
 * Shared mock data for chat-view stories. Centralized so each view story
 * file is just a configuration of the ChatView shell + the right slice of
 * this data, matching the wireframes in `designs/views/02-chat-view/`.
 *
 * NOTE: storybook RN evaluates each story module eagerly during prep, so
 * keep this file dependency-light (no expo-router, no useTheme).
 */

export const MOCK_HEADER = {
	title: "Fix auth bug",
	subtitle: "superset · main",
	showBack: true,
	showActions: true,
} as const;

export const MOCK_PROJECT_SUBTITLE = "superset · main";

/** UC-RENDER-01 canonical user message → streaming assistant turn. */
export const MOCK_THREAD_STREAMING: ChatThreadItem[] = [
	{
		id: "u1",
		kind: "user",
		message: "Can you refactor billing to use tRPC?",
		timestamp: "9:41 AM",
	},
	{
		id: "a1-head",
		kind: "assistant-head",
		timestamp: "9:41 AM",
		variant: "streaming",
	},
	{
		id: "a1-body",
		kind: "assistant-body",
		body: (
			<Text className="text-foreground leading-6">
				Sure! Here's how I'd approach the refactor:{"\n\n"}
				1. Move the billing router to a typed tRPC procedure.{"\n"}
				2. Update the React Query keys to match.{"\n\n"}
				The key change is replacing the REST calls with tRPC mutations…
			</Text>
		),
	},
];

/** UC-RENDER-03 markdown — code block + inline code variant. */
export const MOCK_THREAD_MARKDOWN: ChatThreadItem[] = [
	{
		id: "u-md",
		kind: "user",
		message: "Show me the new procedure.",
		timestamp: "9:42 AM",
	},
	{
		id: "a-md-head",
		kind: "assistant-head",
		timestamp: "9:42 AM",
		variant: "completed",
		completedDuration: "· 1.4s",
	},
	{
		id: "a-md-body",
		kind: "assistant-body",
		body: (
			<Text className="text-foreground leading-6">
				Here's the new <Text className="font-mono">billing.charge</Text>{" "}
				procedure. Copy the snippet below — note the{" "}
				<Text className="font-mono">protectedProcedure</Text> wrapper:
			</Text>
		),
	},
];

/** UC-RENDER-04 tool-calls (running / done / failed) — full triple state. */
export const MOCK_THREAD_TOOL_CALLS: ChatThreadItem[] = [
	{
		id: "u-tools",
		kind: "user",
		message: "Run the integration tests.",
		timestamp: "9:50 AM",
	},
	{
		id: "a-tools-head",
		kind: "assistant-head",
		timestamp: "9:50 AM",
		variant: "streaming",
	},
	{
		id: "tc-read",
		kind: "tool-call",
		name: "read_file",
		args: "packages/billing/src/router.ts",
		status: "done",
		icon: FileSearch,
		duration: "0.4s",
	},
	{
		id: "tc-edit",
		kind: "tool-call",
		name: "edit_file",
		args: "router.ts — replace fetch with trpc mutation",
		status: "running",
		icon: FileCode,
	},
	{
		id: "tc-test",
		kind: "tool-call",
		name: "run_tests",
		args: "packages/billing — billing.spec.ts",
		status: "error",
		icon: Hammer,
		duration: "2.1s",
	},
];

/** UC-RENDER-05 reasoning + plan collapsed blocks. */
export const MOCK_THREAD_REASONING_PLAN: ChatThreadItem[] = [
	{
		id: "u-plan",
		kind: "user",
		message: "Plan the migration before you start editing files.",
		timestamp: "10:01 AM",
	},
	{
		id: "a-plan-head",
		kind: "assistant-head",
		timestamp: "10:01 AM",
		variant: "completed",
		completedDuration: "· 0.9s",
	},
	{
		id: "plan-block",
		kind: "collapsed-block",
		blockKind: "plan",
		meta: "4 steps",
		defaultOpen: true,
		children: (
			<Text className="text-muted-foreground leading-6">
				1. Audit billing router call sites{"\n"}
				2. Generate the new tRPC procedure{"\n"}
				3. Migrate React Query keys{"\n"}
				4. Add deprecation guard to legacy REST endpoint
			</Text>
		),
	},
	{
		id: "reasoning-block",
		kind: "collapsed-block",
		blockKind: "reasoning",
		meta: "12s",
		defaultOpen: false,
		children: (
			<Text className="text-muted-foreground leading-6">
				The migration risk concentrates around React Query key drift. Holding
				the old fetcher in place behind a feature flag preserves rollback…
			</Text>
		),
	},
];

/** UC-RENDER-06 nested subagent execution. */
export const MOCK_THREAD_SUBAGENT: ChatThreadItem[] = [
	{
		id: "u-sub",
		kind: "user",
		message: "Audit the package boundaries.",
		timestamp: "10:15 AM",
	},
	{
		id: "a-sub-head",
		kind: "assistant-head",
		timestamp: "10:15 AM",
		variant: "completed",
		completedDuration: "· 3.2s",
	},
	{
		id: "subagent-block",
		kind: "collapsed-block",
		blockKind: "subagent",
		meta: "audit-package-boundaries",
		defaultOpen: true,
		children: (
			<Text className="text-muted-foreground leading-6">
				Subagent inspected 14 packages. Flagged 2 circular dependencies between{" "}
				<Text className="font-mono">@superset/db</Text> and{" "}
				<Text className="font-mono">@superset/shared</Text>.
			</Text>
		),
	},
];

/** Settings used by every Composer in mock stories. */
export const MOCK_COMPOSER_SETTINGS = {
	modelName: "Sonnet 4.6",
	permissionMode: "default" as const,
	thinkingLevel: "low" as const,
};

/** UC-COMP-01 §C slash-command popover data. */
export const MOCK_SLASH_COMMANDS = [
	{
		id: "builtin-help",
		name: "/help",
		description: "Show available slash commands",
		source: "builtin" as const,
	},
	{
		id: "builtin-model",
		name: "/model",
		description: "Switch the active model",
		source: "builtin" as const,
	},
	{
		id: "builtin-stop",
		name: "/stop",
		description: "Stop the current turn",
		source: "builtin" as const,
	},
	{
		id: "user-deploy",
		name: "/deploy",
		description: "Trigger the production deploy workflow",
		source: "user" as const,
	},
	{
		id: "project-review",
		name: "/review",
		description: "Run the project review checklist",
		source: "project" as const,
	},
];

/** UC-COMP-04 model picker sections. */
export const MOCK_MODEL_PICKER_SECTIONS = [
	{
		id: "anthropic",
		label: "Anthropic",
		items: [
			{
				id: "opus-4-7",
				label: "Opus 4.7",
				hint: "Most capable",
				badge: undefined,
			},
			{
				id: "sonnet-4-6",
				label: "Sonnet 4.6",
				hint: "Fast + cheap",
				badge: undefined,
			},
			{
				id: "haiku-4-5",
				label: "Haiku 4.5",
				hint: "Fastest",
				badge: undefined,
			},
		],
	},
	{
		id: "openai",
		label: "OpenAI",
		items: [
			{ id: "gpt-5", label: "GPT-5", hint: "New", badge: undefined },
			{ id: "gpt-4o", label: "GPT-4o", hint: "Multimodal", badge: undefined },
		],
	},
] as const;

/** UC-COMP-05 thinking-level picker. */
export const MOCK_THINKING_PICKER_SECTIONS = [
	{
		id: "thinking",
		label: "Reasoning effort",
		items: [
			{ id: "off", label: "Off", hint: "No extended thinking" },
			{ id: "low", label: "Low", hint: "~1K tokens" },
			{ id: "medium", label: "Medium", hint: "~8K tokens" },
			{ id: "high", label: "High", hint: "~32K tokens" },
			{ id: "xhigh", label: "Extreme", hint: "~64K tokens" },
		],
	},
] as const;

/** UC-PAUSE-02 ask_user suggested-answer pills. */
export const MOCK_ASK_USER_QUESTION = "Which approach should I use?";
export const MOCK_ASK_USER_PILLS = ["tRPC", "REST API", "Both"] as const;

/** UC-PAUSE-03 plan review markdown body. */
export const MOCK_PLAN_REVIEW_MARKDOWN = `# Migration plan

## Step 1 — audit call sites
Search the repo for every \`fetch('/api/billing')\` and tabulate the call sites.

## Step 2 — generate procedure
Add \`billing.charge\` as a protected tRPC procedure backed by the existing\nservice layer.

## Step 3 — migrate clients
Replace REST calls with the new tRPC hook. Keep the old fetcher behind a\nfeature flag for one release.

## Step 4 — deprecate
Add a 410 Gone response to the legacy REST endpoint after the flag flips.`;
