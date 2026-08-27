"use client";

import { BashTool } from "@superset/ui/ai-elements/bash-tool";
import { ClickableFilePath } from "@superset/ui/ai-elements/clickable-file-path";
import {
	Confirmation,
	ConfirmationAccepted,
	ConfirmationAction,
	ConfirmationActions,
	ConfirmationRejected,
	ConfirmationRequest,
	ConfirmationTitle,
} from "@superset/ui/ai-elements/confirmation";
import { ExploringGroup } from "@superset/ui/ai-elements/exploring-group";
import { FileDiffTool } from "@superset/ui/ai-elements/file-diff-tool";
import { ReadFileTool } from "@superset/ui/ai-elements/read-file-tool";
import { ShowCode } from "@superset/ui/ai-elements/show-code";
import {
	Tool,
	ToolContent,
	ToolHeader,
	ToolInput,
	ToolOutput,
} from "@superset/ui/ai-elements/tool";
import { ToolCall } from "@superset/ui/ai-elements/tool-call";
import { ToolCallRow } from "@superset/ui/ai-elements/tool-call-row";
import { ToolInterrupted } from "@superset/ui/ai-elements/tool-interrupted";
import { UserQuestionTool } from "@superset/ui/ai-elements/user-question-tool";
import { WebFetchTool } from "@superset/ui/ai-elements/web-fetch-tool";
import { WebSearchTool } from "@superset/ui/ai-elements/web-search-tool";
import { FileSearchIcon, SearchIcon } from "lucide-react";

import { ComponentCard } from "../../../components/ComponentCard";
import { ShowcaseSection } from "../../../components/ShowcaseSection";

const TYPECHECK_STDOUT = `$ tsc --noEmit
✓ No type errors found in 642 files
Done in 6.91s`;

const LINT_STDERR = `apps/desktop/src/renderer/workspaces/WorkspaceScreen.tsx:118:12 lint/suspicious/noExplicitAny
  × Unexpected any. Specify a different type.

Checked 642 files in 410ms. Found 1 error.`;

const USE_WORKSPACES_CONTENT = `import { useLiveQuery } from "@tanstack/react-db";
import { workspaceCollection } from "../collections/workspaces";

export function useWorkspaces(organizationId: string) {
	const { data, isReady } = useLiveQuery(
		(q) =>
			q
				.from({ workspace: workspaceCollection })
				.where(({ workspace }) =>
					eq(workspace.organizationId, organizationId),
				),
		[organizationId],
	);

	return { workspaces: data ?? [], isReady };
}`;

const WORKSPACE_OLD_STRING = `const { data } = useLiveQuery((q) =>
	q.from({ workspace: workspaceCollection }),
);

if (!isReady) return <Skeleton />;
return <WorkspaceList workspaces={data} />;`;

const WORKSPACE_NEW_STRING = `const { data, isReady } = useLiveQuery((q) =>
	q.from({ workspace: workspaceCollection }),
);

if (data.length === 0 && !isReady) return <Skeleton />;
if (data.length === 0) return <EmptyState />;
return <WorkspaceList workspaces={data} />;`;

const WORKSPACES_DOCS_CONTENT = `# Workspaces

Superset workspaces are isolated git worktrees. Each workspace gets:

- Its own branch, checked out from the repo default branch
- An isolated working directory under ~/.superset/worktrees
- A dedicated terminal session wired to the host service

## Creating a workspace

Run \`superset ws create --project PROJECT_ID --branch BRANCH --agent claude\`
or use the desktop app's New Workspace flow.`;

const WORKSPACES_SCHEMA_SOURCE = `import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const workspaces = pgTable("workspaces", {
	id: text("id").primaryKey(),
	organizationId: text("organization_id")
		.notNull()
		.references(() => organizations.id),
	branch: text("branch").notNull(),
	projectId: text("project_id").notNull(),
	isArchived: boolean("is_archived").notNull().default(false),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;`;

export function AiToolCallsSection() {
	return (
		<ShowcaseSection
			description="Bash, file diffs, web fetch/search, confirmations — and the shared chrome they're built on"
			id="ai-tool-calls"
			index="06"
			title="AI · Tool calls"
		>
			<ComponentCard
				description="Generic collapsible primitive — the other tool-call components below build on Tool Call Row instead, but MCP-style tools render on this one directly"
				importPath="@superset/ui/ai-elements/tool"
				span
				title="Tool"
			>
				<Tool className="w-full" defaultOpen>
					<ToolHeader open state="output-available" title="grep_search" />
					<ToolContent>
						<ToolInput
							input={{
								pattern: "useLiveQuery",
								path: "apps/desktop/src",
							}}
						/>
						<ToolOutput output="14 matches across 6 files" />
					</ToolContent>
				</Tool>
			</ComponentCard>

			<ComponentCard
				description="Compact collapsible row every tool-call component below is built on"
				importPath="@superset/ui/ai-elements/tool-call-row"
				title="Tool Call Row"
			>
				<ToolCallRow
					className="w-full"
					description="useLiveQuery in apps/desktop/src"
					icon={SearchIcon}
					title="Grep"
				>
					<div className="space-y-0.5 py-1.5 pl-2 font-mono text-xs text-muted-foreground">
						<div>apps/desktop/src/collections/workspaces.ts</div>
						<div>apps/desktop/src/hooks/useWorkspaces.ts</div>
						<div>packages/trpc/src/router/workspace.ts</div>
					</div>
				</ToolCallRow>
			</ComponentCard>

			<ComponentCard
				description="Single-line item; the row Exploring Group renders for each step"
				importPath="@superset/ui/ai-elements/tool-call"
				title="Tool Call"
			>
				<div className="w-full max-w-xs space-y-1">
					<ToolCall
						icon={FileSearchIcon}
						isError={false}
						isPending={false}
						subtitle="useWorkspaces.ts"
						title="Read"
					/>
					<ToolCall
						icon={SearchIcon}
						isError={false}
						isPending
						subtitle="isReady in apps/desktop/src"
						title="Grep"
					/>
				</div>
			</ComponentCard>

			<ComponentCard
				description="Shown when a running tool call is cancelled mid-flight"
				importPath="@superset/ui/ai-elements/tool-interrupted"
				title="Tool Interrupted"
			>
				<div className="w-full max-w-xs space-y-1">
					<ToolInterrupted
						subtitle="bun install && bun run build --filter=@superset/desktop"
						toolName="Bash"
					/>
					<ToolInterrupted toolName="Web Search" />
				</div>
			</ComponentCard>

			<ComponentCard
				description="Approve/deny prompt for tools awaiting permission"
				importPath="@superset/ui/ai-elements/confirmation"
				span
				title="Confirmation"
			>
				<div className="w-full space-y-3">
					<Confirmation
						approval={{ id: "approval-1" }}
						state="approval-requested"
					>
						<ConfirmationTitle>
							The agent wants to run `bun run db:migrate`. Allow it?
						</ConfirmationTitle>
						<ConfirmationRequest>
							<ConfirmationActions>
								<ConfirmationAction variant="outline">
									Reject
								</ConfirmationAction>
								<ConfirmationAction>Approve</ConfirmationAction>
							</ConfirmationActions>
						</ConfirmationRequest>
					</Confirmation>
					<Confirmation
						approval={{ approved: true, id: "approval-2" }}
						state="output-available"
					>
						<ConfirmationAccepted>
							<ConfirmationTitle>Approved — migration ran.</ConfirmationTitle>
						</ConfirmationAccepted>
					</Confirmation>
					<Confirmation
						approval={{ approved: false, id: "approval-3" }}
						state="output-available"
					>
						<ConfirmationRejected>
							<ConfirmationTitle>
								Rejected — migration skipped.
							</ConfirmationTitle>
						</ConfirmationRejected>
					</Confirmation>
				</div>
			</ComponentCard>

			<ComponentCard
				bleed
				description="Syntax-highlighted block with a clickable filename header — collapses past 15 lines"
				importPath="@superset/ui/ai-elements/show-code"
				span
				title="Show Code"
			>
				<ShowCode
					code={WORKSPACES_SCHEMA_SOURCE}
					filename="packages/db/src/schema/workspaces.ts"
					language="typescript"
					lineRange="1–16"
					onOpen={() => {}}
				/>
			</ComponentCard>

			<ComponentCard
				description="Command plus stdout/stderr, built on Tool Call Row"
				importPath="@superset/ui/ai-elements/bash-tool"
				span
				title="Bash Tool"
			>
				<div className="w-full space-y-2">
					<BashTool
						className="w-full"
						command="bun run typecheck"
						exitCode={0}
						state="output-available"
						stdout={TYPECHECK_STDOUT}
					/>
					<BashTool
						className="w-full"
						command="bun run lint"
						exitCode={1}
						state="output-error"
						stderr={LINT_STDERR}
					/>
				</div>
			</ComponentCard>

			<ComponentCard
				description="File read with a clickable path and syntax-highlighted preview"
				importPath="@superset/ui/ai-elements/read-file-tool"
				span
				title="Read File Tool"
			>
				<ReadFileTool
					className="w-full"
					content={USE_WORKSPACES_CONTENT}
					filename="apps/desktop/src/hooks/useWorkspaces.ts"
					isPending={false}
					language="typescript"
					lineRange="1–13"
					onOpenInPane={() => {}}
				/>
			</ComponentCard>

			<ComponentCard
				description="Edit diff with additions, removals, and an Open menu"
				importPath="@superset/ui/ai-elements/file-diff-tool"
				span
				title="File Diff Tool"
			>
				<FileDiffTool
					className="w-full"
					filePath="apps/desktop/src/renderer/workspaces/WorkspaceScreen.tsx"
					newString={WORKSPACE_NEW_STRING}
					oldString={WORKSPACE_OLD_STRING}
					onDiffPathClick={() => {}}
					onFilePathClick={() => {}}
					state="output-available"
				/>
			</ComponentCard>

			<ComponentCard
				description="Fetched page content with byte size and status"
				importPath="@superset/ui/ai-elements/web-fetch-tool"
				title="Web Fetch Tool"
			>
				<WebFetchTool
					bytes={48213}
					className="w-full"
					content={WORKSPACES_DOCS_CONTENT}
					state="output-available"
					statusCode={200}
					url="https://superset.sh/docs/workspaces"
				/>
			</ComponentCard>

			<ComponentCard
				description="Query with linked results"
				importPath="@superset/ui/ai-elements/web-search-tool"
				title="Web Search Tool"
			>
				<WebSearchTool
					className="w-full"
					query="tanstack db live queries cache-first rendering"
					results={[
						{
							title: "TanStack DB — Live Queries",
							url: "https://tanstack.com/db/latest/docs/live-queries",
						},
						{
							title: "ElectricSQL: Postgres sync for local-first apps",
							url: "https://electric-sql.com/docs/intro",
						},
						{
							title: "Superset — Orchestrate coding agents",
							url: "https://superset.sh/docs/workspaces",
						},
					]}
					state="output-available"
				/>
			</ComponentCard>

			<ComponentCard
				bleed
				description="Blocking question the agent asks mid-task — arrow keys, 1-9, or click"
				importPath="@superset/ui/ai-elements/user-question-tool"
				span
				title="User Question Tool"
			>
				<UserQuestionTool
					className="m-4 max-w-sm"
					onAnswer={() => {}}
					onSkip={() => {}}
					questions={[
						{
							header: "Schema decision",
							question:
								"Which database should the new workspace events table live in?",
							options: [
								{
									label: "Neon Postgres (packages/db)",
									description: "Synced to all clients via Electric",
								},
								{
									label: "Local SQLite (packages/local-db)",
									description: "Device-only, no sync",
								},
								{
									label: "host.db",
									description: "Canonical workspace record on the host service",
								},
							],
						},
					]}
				/>
			</ComponentCard>

			<ComponentCard
				description="Collapses a burst of file reads and searches into one summary line"
				importPath="@superset/ui/ai-elements/exploring-group"
				title="Exploring Group"
			>
				<ExploringGroup
					className="w-full max-w-sm"
					isStreaming
					items={[
						{
							icon: SearchIcon,
							isError: false,
							isPending: false,
							subtitle: "useLiveQuery in apps/desktop/src",
							title: "Grep",
						},
						{
							icon: FileSearchIcon,
							isError: false,
							isPending: false,
							subtitle: "apps/desktop/src/collections/workspaces.ts",
							title: "Read",
						},
						{
							icon: FileSearchIcon,
							isError: false,
							isPending: false,
							subtitle: "packages/trpc/src/router/workspace.ts",
							title: "Read",
						},
						{
							icon: SearchIcon,
							isError: false,
							isPending: true,
							subtitle: "isReady in apps/desktop/src/renderer",
							title: "Grep",
						},
					]}
				/>
			</ComponentCard>

			<ComponentCard
				description="Basename-only path, interactive when onOpen is passed"
				importPath="@superset/ui/ai-elements/clickable-file-path"
				title="Clickable File Path"
			>
				<div className="flex flex-col items-start gap-2 text-xs text-muted-foreground">
					<span>
						Read{" "}
						<ClickableFilePath
							onOpen={() => {}}
							path="apps/desktop/src/hooks/useWorkspaces.ts"
						/>{" "}
						(13 lines)
					</span>
					<span>
						Referenced{" "}
						<ClickableFilePath path="packages/db/src/schema/workspaces.ts" />
					</span>
				</div>
			</ComponentCard>
		</ShowcaseSection>
	);
}
