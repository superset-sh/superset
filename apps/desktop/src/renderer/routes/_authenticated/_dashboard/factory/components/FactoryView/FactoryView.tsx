import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
	LuBot,
	LuCircleAlert,
	LuFlaskConical,
	LuLoaderCircle,
	LuShieldCheck,
} from "react-icons/lu";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { FactoryBoard } from "../../components/FactoryBoard";
import { FactoryEmptyState } from "../../components/FactoryEmptyState";
import { FactoryInspector } from "../../components/FactoryInspector";
import { FactoryNewWorkDialog } from "../../components/FactoryNewWorkDialog";
import { FactoryToolbar } from "../../components/FactoryToolbar";
import { useFactoryData } from "../../hooks/useFactoryData";
import type {
	FactoryBoardKind,
	FactoryStage,
	FactoryWorkItem,
} from "../../types";
import {
	belongsToFactoryBoard,
	getFactoryStage,
} from "../../utils/factory-utils";

interface FactoryViewProps {
	demo: boolean;
}

const STAGE_PRIORITY: FactoryStage[] = [
	"planning",
	"review",
	"execute",
	"triage",
	"intake",
	"done",
];

function defaultSelectedItem(
	items: FactoryWorkItem[],
	board: FactoryBoardKind,
): FactoryWorkItem | undefined {
	const boardItems = items.filter((item) => belongsToFactoryBoard(item, board));
	return STAGE_PRIORITY.flatMap((stage) =>
		boardItems.filter((item) => getFactoryStage(item) === stage),
	)[0];
}

export function FactoryView({ demo }: FactoryViewProps) {
	const navigate = useNavigate();
	const factory = useFactoryData({ demo });
	const [board, setBoard] = useState<FactoryBoardKind>("work");
	const [query, setQuery] = useState("");
	const [selectedItemId, setSelectedItemId] = useState<string | null>(
		demo ? "work-35236" : null,
	);
	const [newWorkOpen, setNewWorkOpen] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [inspectorDismissed, setInspectorDismissed] = useState(false);

	const selectedItem = useMemo(
		() => factory.workItems.find((item) => item.id === selectedItemId) ?? null,
		[factory.workItems, selectedItemId],
	);

	useEffect(() => {
		if (selectedItem && belongsToFactoryBoard(selectedItem, board)) {
			return;
		}
		if (inspectorDismissed) return;
		setSelectedItemId(
			defaultSelectedItem(factory.workItems, board)?.id ?? null,
		);
	}, [board, factory.workItems, inspectorDismissed, selectedItem]);

	const boardItems = useMemo(
		() =>
			factory.workItems.filter((item) => belongsToFactoryBoard(item, board)),
		[board, factory.workItems],
	);
	const activeAgents = boardItems.filter((item) => item.metadata.agent).length;
	const decisionsWaiting = boardItems.filter((item) =>
		["planning", "review"].includes(getFactoryStage(item)),
	).length;

	const handleTransition = async (
		item: FactoryWorkItem,
		stage: FactoryStage,
	) => {
		try {
			await factory.transition({ item, board, stage });
			toast.success(
				stage === "execute"
					? "Plan approved — builder is starting the worktree"
					: `Work moved to ${stage}`,
			);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Factory could not move the work.",
			);
		}
	};

	const handleOpenWorkspace = (item: FactoryWorkItem) => {
		if (!item.metadata.workspaceId) {
			toast.message("Factory is still preparing the worktree.");
			return;
		}
		if (demo) {
			toast.success("Workspace handoff is ready", {
				description: item.metadata.branch,
			});
			return;
		}
		void navigateToV2Workspace(item.metadata.workspaceId, navigate);
	};

	const handleOpenPullRequest = (item: FactoryWorkItem) => {
		if (!item.url) {
			toast.message("Factory has not attached a pull request yet.");
			return;
		}
		window.open(item.url, "_blank", "noopener,noreferrer");
	};

	if (factory.isLoading) {
		return (
			<div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
				<LuLoaderCircle className="mr-2 size-4 animate-spin" />
				Loading Factory state…
			</div>
		);
	}

	if (factory.projects.length === 0) {
		return (
			<FactoryEmptyState
				hostReady={factory.activeHostUrl !== null}
				pending={factory.createProjectPending}
				error={
					(factory.createProjectError ?? factory.error) instanceof Error
						? (factory.createProjectError ?? factory.error)
						: null
				}
				onCreate={() => {
					void factory.createProject().catch(() => undefined);
				}}
				onExploreSample={() => {
					void navigate({
						to: "/factory",
						search: { demo: true },
					});
				}}
			/>
		);
	}

	return (
		<div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-background">
			<FactoryToolbar
				activeProjectId={factory.activeProjectId}
				board={board}
				items={factory.workItems}
				projects={factory.projects}
				query={query}
				refreshing={refreshing}
				onAddWork={() => setNewWorkOpen(true)}
				onBoardChange={setBoard}
				onProjectChange={factory.setActiveProjectId}
				onQueryChange={setQuery}
				onRefresh={() => {
					setRefreshing(true);
					void factory.refresh().finally(() => setRefreshing(false));
				}}
			/>

			<div className="flex h-8 shrink-0 items-center gap-4 overflow-hidden border-b border-border/70 bg-muted/20 px-3 text-xs text-muted-foreground sm:px-4">
				<span className="flex items-center gap-1.5">
					<LuCircleAlert className="size-3.5 text-primary" />
					<strong className="font-medium text-foreground tabular-nums">
						{decisionsWaiting}
					</strong>
					needs your decision
				</span>
				<span
					className="hidden h-3 w-px bg-border md:block"
					aria-hidden="true"
				/>
				<span className="hidden items-center gap-1.5 md:flex">
					<LuBot className="size-3.5" />
					<strong className="font-medium text-foreground tabular-nums">
						{activeAgents}
					</strong>
					agents active
				</span>
				{demo ? (
					<span className="ml-auto hidden items-center gap-1.5 lg:flex">
						<LuFlaskConical className="size-3.5 text-amber-600 dark:text-amber-400" />
						Sample data · changes stay in this view
					</span>
				) : (
					<span className="ml-auto hidden items-center gap-1.5 lg:flex">
						<LuShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
						Human gates enforced
					</span>
				)}
			</div>

			{factory.error && (
				<div className="select-text cursor-text border-b border-amber-500/25 bg-amber-500/[0.06] px-4 py-2 text-xs text-amber-800 dark:text-amber-300">
					Factory could not refresh:{" "}
					{factory.error instanceof Error
						? factory.error.message
						: "Unknown error"}
				</div>
			)}

			<div className="relative flex min-h-0 min-w-0 flex-1">
				<FactoryBoard
					board={board}
					items={factory.workItems}
					query={query}
					selectedItemId={selectedItemId}
					onSelectItem={(item) => {
						setInspectorDismissed(false);
						setSelectedItemId(item.id);
					}}
				/>
				{selectedItem && belongsToFactoryBoard(selectedItem, board) && (
					<FactoryInspector
						key={selectedItem.id}
						item={selectedItem}
						pending={factory.transitionPending}
						onAdvance={(stage) => {
							void handleTransition(selectedItem, stage);
						}}
						onClose={() => {
							setInspectorDismissed(true);
							setSelectedItemId(null);
						}}
						onOpenPullRequest={() => handleOpenPullRequest(selectedItem)}
						onOpenWorkspace={() => handleOpenWorkspace(selectedItem)}
					/>
				)}
			</div>

			<FactoryNewWorkDialog
				open={newWorkOpen}
				pending={factory.createWorkItemPending}
				onOpenChange={setNewWorkOpen}
				onCreate={async (title) => {
					try {
						const item = await factory.createWorkItem(title);
						setBoard("work");
						setInspectorDismissed(false);
						setSelectedItemId(item.id);
						toast.success("Request added to Intake");
					} catch (error) {
						toast.error(
							error instanceof Error
								? error.message
								: "Factory could not add the request.",
						);
						throw error;
					}
				}}
			/>
		</div>
	);
}
