import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { useEffect, useRef } from "react";
import { LuRefreshCw } from "react-icons/lu";
import { SiLinear } from "react-icons/si";
import {
	useLinearConnection,
	useLinearWorkspace,
} from "../../../../hooks/useLinearWorkspace";
import type { ViewMode } from "../../../../stores/tasks-filter-state";
import type { LinearIssue } from "../../../../utils/linearIssueTypes";
import { LinearCTA } from "../LinearCTA";
import { LinearIssueBoard } from "./components/LinearIssueBoard";
import { LinearIssueRow } from "./components/LinearIssueRow";
import {
	type LinearIssueFilters,
	useLinearIssues,
} from "./hooks/useLinearIssues";

interface LinearIssuesContentProps {
	filters: LinearIssueFilters;
	viewMode: ViewMode;
	onOpen: (issue: LinearIssue) => void;
}

export function LinearIssuesContent({
	filters,
	viewMode,
	onOpen,
}: LinearIssuesContentProps) {
	const { t } = useLingui();
	const connection = useLinearConnection();
	const isConnected = !!connection.data && !connection.data.needsReconnect;
	const workspace = useLinearWorkspace({ enabled: isConnected });
	const {
		issues,
		error,
		isFetching,
		isLoading,
		hasNextPage,
		isFetchingNextPage,
		fetchNextPage,
		refetch,
	} = useLinearIssues(filters);
	const sentinelRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const sentinel = sentinelRef.current;
		if (!sentinel || !hasNextPage) return;
		const observer = new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage)
				void fetchNextPage();
		});
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);

	if (connection.isLoading) return null;
	if (!isConnected) {
		return <LinearCTA needsReconnect={!!connection.data?.needsReconnect} />;
	}

	const showTeam = !filters.teamId && (workspace.data?.teams.length ?? 0) > 1;

	return (
		<div
			className="@container flex h-full min-h-0 flex-col overflow-hidden"
			aria-busy={isFetching}
		>
			<div className="flex shrink-0 items-center gap-2 border-b bg-muted/30 px-4 py-2">
				<SiLinear className="size-3.5 text-muted-foreground" />
				<span className="text-xs text-muted-foreground" aria-live="polite">
					{isLoading ? (
						<Trans>Loading…</Trans>
					) : (
						<>
							<span className="tabular-nums">
								{issues.length}
								{hasNextPage ? "+" : ""}
							</span>{" "}
							<Plural
								value={issues.length}
								one="Linear issue"
								other="Linear issues"
							/>
						</>
					)}
				</span>
				<Button
					variant="ghost"
					size="icon-xs"
					className="ml-auto"
					title={t({ message: "Refresh" })}
					aria-label={t({ message: "Refresh Linear issues" })}
					disabled={isFetching}
					onClick={() => refetch()}
				>
					<LuRefreshCw
						className={
							isFetching
								? "size-3.5 animate-spin motion-reduce:animate-none"
								: "size-3.5"
						}
					/>
				</Button>
			</div>

			{error && issues.length === 0 ? (
				<div className="flex cursor-text select-text flex-col items-start gap-3 px-4 py-4 text-sm text-destructive">
					<span>{error.message}</span>
					<Button variant="outline" size="sm" onClick={() => refetch()}>
						<Trans>Try again</Trans>
					</Button>
				</div>
			) : isLoading ? (
				<div className="flex flex-1 items-center justify-center gap-2 p-8 text-muted-foreground">
					<LuRefreshCw className="size-4 animate-spin motion-reduce:animate-none" />
					<span className="text-sm">
						<Trans>Loading issues…</Trans>
					</span>
				</div>
			) : issues.length === 0 ? (
				<div className="flex flex-1 items-center justify-center p-8">
					<span className="text-sm text-muted-foreground">
						<Trans>No issues found.</Trans>
					</span>
				</div>
			) : viewMode === "board" ? (
				<LinearIssueBoard
					issues={issues}
					workspace={workspace.data}
					teamId={filters.teamId}
					status={filters.status}
					onOpen={onOpen}
					hasNextPage={hasNextPage}
					isFetchingNextPage={isFetchingNextPage}
					onLoadMore={() => void fetchNextPage()}
				/>
			) : (
				<div className="min-h-0 flex-1 overflow-y-auto">
					{issues.map((issue) => (
						<LinearIssueRow
							key={issue.id}
							issue={issue}
							showTeam={showTeam}
							onOpen={onOpen}
						/>
					))}
					<div
						ref={sentinelRef}
						className="flex items-center justify-center py-3 text-muted-foreground"
					>
						{isFetchingNextPage && (
							<LuRefreshCw className="size-4 animate-spin motion-reduce:animate-none" />
						)}
					</div>
				</div>
			)}
		</div>
	);
}
