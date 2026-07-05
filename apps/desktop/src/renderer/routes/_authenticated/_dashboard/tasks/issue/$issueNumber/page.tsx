import { Button } from "@superset/ui/button";
import { ScrollArea } from "@superset/ui/scroll-area";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { GoIssueClosed, GoIssueOpened } from "react-icons/go";
import { HiArrowLeft } from "react-icons/hi2";
import { LuExternalLink, LuPlus } from "react-icons/lu";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	type LinkedIssue,
	useNewWorkspaceDraftStore,
} from "renderer/stores/new-workspace-draft";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import { Route as TasksLayoutRoute } from "../../layout";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/tasks/issue/$issueNumber/",
)({
	component: IssueDetailPage,
});

function IssueDetailPage() {
	const { issueNumber: issueNumberRaw } = Route.useParams();
	const issueNumber = Number.parseInt(issueNumberRaw, 10);
	const search = TasksLayoutRoute.useSearch();
	const navigate = useNavigate();
	const hostUrl = useHostUrl(null);
	const projectId = search.project ?? null;
	const updateDraft = useNewWorkspaceDraftStore((s) => s.updateDraft);
	const resetDraft = useNewWorkspaceDraftStore((s) => s.resetDraft);
	const openModal = useOpenNewWorkspaceModal();

	const backSearch = useMemo(() => {
		const s: Record<string, string> = {};
		if (search.tab) s.tab = search.tab;
		if (search.assignee) s.assignee = search.assignee;
		if (search.search) s.search = search.search;
		if (search.type) s.type = search.type;
		if (search.project) s.project = search.project;
		return s;
	}, [search]);

	const { data, isLoading, error } = useQuery({
		queryKey: ["issue-detail", projectId, hostUrl, issueNumber],
		queryFn: async () => {
			if (!hostUrl || !projectId) return null;
			const client = getHostServiceClientByUrl(hostUrl);
			return client.issues.getContent.query({
				projectId,
				issueNumber,
			});
		},
		enabled: !!hostUrl && !!projectId && Number.isFinite(issueNumber),
		retry: false,
		staleTime: 30_000,
		gcTime: 10 * 60_000,
	});

	const handleBack = () => {
		navigate({ to: "/tasks", search: backSearch });
	};

	const handleAddToWorkspace = () => {
		if (!projectId || !data) return;
		const linkedIssue: LinkedIssue = {
			slug: `gh-${data.number}`,
			title: data.title,
			source: "github",
			url: data.url,
			number: data.number,
			state: data.state.toLowerCase() === "closed" ? "closed" : "open",
		};
		resetDraft();
		updateDraft({
			selectedProjectId: projectId,
			linkedIssues: [linkedIssue],
		});
		openModal(projectId);
	};

	if (!projectId) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<span className="text-muted-foreground">No project specified.</span>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<span className="text-muted-foreground">Loading issue…</span>
			</div>
		);
	}

	if (error instanceof Error || !data) {
		return (
			<div className="flex-1 flex flex-col min-h-0">
				<Header
					issueNumber={issueNumber}
					url={null}
					isClosed={false}
					onBack={handleBack}
					onAddToWorkspace={null}
				/>
				<div className="px-6 py-6 text-sm text-destructive select-text cursor-text">
					{error instanceof Error ? error.message : "Issue not found."}
				</div>
			</div>
		);
	}

	const isClosed = data.state.toLowerCase() === "closed";
	const StateIcon = isClosed ? GoIssueClosed : GoIssueOpened;

	return (
		<div className="flex-1 flex flex-col min-h-0">
			<Header
				issueNumber={data.number}
				url={data.url}
				isClosed={isClosed}
				onBack={handleBack}
				onAddToWorkspace={handleAddToWorkspace}
			/>

			<ScrollArea className="flex-1 min-h-0">
				<div className="px-6 py-6 max-w-4xl">
					<div className="flex items-start gap-3 mb-4">
						<StateIcon
							className={
								isClosed
									? "size-5 shrink-0 mt-1 text-violet-500"
									: "size-5 shrink-0 mt-1 text-emerald-500"
							}
						/>
						<h1 className="text-2xl font-semibold leading-tight">
							{data.title}
						</h1>
					</div>

					<div className="flex items-center gap-3 text-xs text-muted-foreground mb-6">
						<span className="capitalize">{data.state}</span>
						{data.author && (
							<>
								<span>·</span>
								<span>by {data.author}</span>
							</>
						)}
					</div>

					{data.body.trim() ? (
						<MarkdownRenderer content={data.body} />
					) : (
						<p className="text-sm text-muted-foreground italic">
							No description provided.
						</p>
					)}
				</div>
			</ScrollArea>
		</div>
	);
}

interface HeaderProps {
	issueNumber: number;
	url: string | null;
	isClosed: boolean;
	onBack: () => void;
	onAddToWorkspace: (() => void) | null;
}

function Header({
	issueNumber,
	url,
	isClosed,
	onBack,
	onAddToWorkspace,
}: HeaderProps) {
	const StateIcon = isClosed ? GoIssueClosed : GoIssueOpened;
	return (
		<div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
			<Button
				variant="ghost"
				size="icon"
				className="h-8 w-8"
				onClick={onBack}
				aria-label="Back to tasks"
			>
				<HiArrowLeft className="w-4 h-4" />
			</Button>
			<StateIcon
				className={
					isClosed ? "size-4 text-violet-500" : "size-4 text-emerald-500"
				}
			/>
			<span className="text-sm text-muted-foreground font-mono tabular-nums">
				#{issueNumber}
			</span>
			<div className="ml-auto flex items-center gap-1">
				{url && (
					<a
						href={url}
						target="_blank"
						rel="noopener noreferrer"
						className="text-muted-foreground hover:text-foreground transition-colors p-2"
						title="Open in GitHub"
					>
						<LuExternalLink className="w-4 h-4" />
					</a>
				)}
				{onAddToWorkspace && (
					<Button
						variant="outline"
						size="sm"
						className="h-8 gap-1.5"
						onClick={onAddToWorkspace}
					>
						<LuPlus className="size-4" />
						Add to workspace
					</Button>
				)}
			</div>
		</div>
	);
}
