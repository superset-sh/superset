import { Button } from "@superset/ui/button";
import { ScrollArea } from "@superset/ui/scroll-area";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { HiArrowLeft } from "react-icons/hi2";
import { LuExternalLink, LuPlus } from "react-icons/lu";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	normalizePRState,
	PRIcon,
	type PRState,
} from "renderer/screens/main/components/PRIcon";
import {
	type LinkedPR,
	useNewWorkspaceDraftStore,
} from "renderer/stores/new-workspace-draft";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import { Route as TasksLayoutRoute } from "../../layout";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/tasks/pr/$prNumber/",
)({
	component: PullRequestDetailPage,
});

function PullRequestDetailPage() {
	const { prNumber: prNumberRaw } = Route.useParams();
	const prNumber = Number.parseInt(prNumberRaw, 10);
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
		queryKey: ["pull-request-detail", projectId, hostUrl, prNumber],
		queryFn: async () => {
			if (!hostUrl || !projectId) return null;
			const client = getHostServiceClientByUrl(hostUrl);
			return client.pullRequests.getContent.query({
				projectId,
				prNumber,
			});
		},
		enabled: !!hostUrl && !!projectId && Number.isFinite(prNumber),
		retry: false,
		staleTime: 30_000,
		gcTime: 10 * 60_000,
	});

	const handleBack = () => {
		navigate({ to: "/tasks", search: backSearch });
	};

	const handleAddToWorkspace = () => {
		if (!projectId || !data) return;
		const linkedPR: LinkedPR = {
			prNumber: data.number,
			title: data.title,
			url: data.url,
			state: normalizePRState(data.state, data.isDraft),
		};
		resetDraft();
		updateDraft({ selectedProjectId: projectId, linkedPR });
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
				<span className="text-muted-foreground">Loading pull request…</span>
			</div>
		);
	}

	if (error instanceof Error || !data) {
		return (
			<div className="flex-1 flex flex-col min-h-0">
				<Header
					prNumber={prNumber}
					url={null}
					state="open"
					onBack={handleBack}
					onAddToWorkspace={null}
				/>
				<div className="px-6 py-6 text-sm text-destructive select-text cursor-text">
					{error instanceof Error ? error.message : "Pull request not found."}
				</div>
			</div>
		);
	}

	const state = normalizePRState(data.state, data.isDraft);
	const stateLabel = data.isDraft ? "Draft" : data.state;
	const branchSummary = data.branch
		? `${data.headRepositoryOwner && data.isCrossRepository ? `${data.headRepositoryOwner}:${data.branch}` : data.branch} → ${data.baseBranch}`
		: null;

	return (
		<div className="flex-1 flex flex-col min-h-0">
			<Header
				prNumber={data.number}
				url={data.url}
				state={state}
				onBack={handleBack}
				onAddToWorkspace={handleAddToWorkspace}
			/>

			<ScrollArea className="flex-1 min-h-0">
				<div className="px-6 py-6 max-w-4xl">
					<div className="flex items-start gap-3 mb-4">
						<PRIcon state={state} className="size-5 shrink-0 mt-1" />
						<h1 className="text-2xl font-semibold leading-tight">
							{data.title}
						</h1>
					</div>

					<div className="flex items-center gap-3 text-xs text-muted-foreground mb-6">
						<span className="capitalize">{stateLabel}</span>
						{data.author && (
							<>
								<span>·</span>
								<span>by {data.author}</span>
							</>
						)}
						{branchSummary && (
							<>
								<span>·</span>
								<span className="font-mono">{branchSummary}</span>
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
	prNumber: number;
	url: string | null;
	state: PRState;
	onBack: () => void;
	onAddToWorkspace: (() => void) | null;
}

function Header({
	prNumber,
	url,
	state,
	onBack,
	onAddToWorkspace,
}: HeaderProps) {
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
			<PRIcon state={state} className="size-4" />
			<span className="text-sm text-muted-foreground font-mono tabular-nums">
				#{prNumber}
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
