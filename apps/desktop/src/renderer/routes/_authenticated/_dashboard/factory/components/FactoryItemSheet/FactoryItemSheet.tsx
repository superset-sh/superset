import { Button } from "@superset/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@superset/ui/sheet";
import { toast } from "@superset/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LuCirclePlay, LuExternalLink } from "react-icons/lu";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import {
	DISPATCHABLE_STAGES,
	type FactoryItem,
	STAGE_LABELS,
} from "../../constants";
import { FactoryRunEntry } from "./components/FactoryRunEntry";

interface FactoryItemSheetProps {
	itemId: string | null;
	onClose: () => void;
	onRunItem: (item: FactoryItem) => void;
	runPending: boolean;
}

export function FactoryItemSheet({
	itemId,
	onClose,
	onRunItem,
	runPending,
}: FactoryItemSheetProps) {
	const utils = cloudTrpc.useUtils();
	const navigate = useNavigate();
	const { data } = cloudTrpc.factory.getItem.useQuery(
		{ itemId: itemId ?? "" },
		{ enabled: !!itemId, refetchInterval: 5_000 },
	);

	const transition = useMutation({
		mutationFn: (input: {
			itemId: string;
			expectedRevision: number;
			toStage: "verify" | "rejected";
			note?: string;
		}) => apiTrpcClient.factory.transitionItem.mutate(input),
		onSuccess: () => {
			void utils.factory.listItems.invalidate();
			void utils.factory.getItem.invalidate();
		},
		onError: (error) => toast.error(error.message),
	});

	const item = data?.item;

	const openWorkspace = (run: {
		v2WorkspaceId: string | null;
		terminalSessionId: string | null;
		chatSessionId: string | null;
	}) => {
		if (!run.v2WorkspaceId) return;
		localStorage.setItem("lastViewedWorkspaceId", run.v2WorkspaceId);
		void navigate({
			to: "/v2-workspace/$workspaceId",
			params: { workspaceId: run.v2WorkspaceId },
			search: {
				terminalId: run.terminalSessionId ?? undefined,
				chatSessionId: run.chatSessionId ?? undefined,
			},
		});
	};

	return (
		<Sheet open={!!itemId} onOpenChange={(open) => !open && onClose()}>
			<SheetContent className="flex w-[480px] flex-col gap-0 sm:max-w-[480px]">
				{item && (
					<>
						<SheetHeader className="shrink-0">
							<SheetTitle className="flex items-start gap-2 pr-6 text-left">
								<span className="flex-1">
									#{item.externalNumber} {item.title}
								</span>
							</SheetTitle>
							<SheetDescription asChild>
								<div className="flex flex-wrap items-center gap-2 text-xs">
									<span className="rounded bg-fill-secondary px-1.5 py-0.5 font-medium">
										{STAGE_LABELS[item.stage]}
									</span>
									{item.kind && (
										<span className="rounded bg-fill-secondary px-1.5 py-0.5">
											{item.kind}
											{item.confidence != null ? ` · ${item.confidence}%` : ""}
										</span>
									)}
									<a
										href={item.externalUrl}
										target="_blank"
										rel="noreferrer"
										className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
									>
										Issue <LuExternalLink className="size-3" />
									</a>
									{item.prUrl && (
										<a
											href={item.prUrl}
											target="_blank"
											rel="noreferrer"
											className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
										>
											PR #{item.prNumber} <LuExternalLink className="size-3" />
										</a>
									)}
								</div>
							</SheetDescription>
						</SheetHeader>

						{item.blockedReason && (
							<p className="mx-4 mt-2 shrink-0 select-text cursor-text rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
								{item.blockedReason}
							</p>
						)}

						<div className="flex shrink-0 items-center gap-2 px-4 py-3">
							{DISPATCHABLE_STAGES.has(item.stage) && (
								<Button
									size="sm"
									disabled={runPending}
									onClick={() => onRunItem(item)}
								>
									<LuCirclePlay className="size-3.5" />
									Run {item.stage === "intake" ? "classify" : item.stage}
								</Button>
							)}
							{item.stage === "human_review" && (
								<Button
									size="sm"
									variant="outline"
									disabled={transition.isPending}
									onClick={() =>
										transition.mutate({
											itemId: item.id,
											expectedRevision: item.revision,
											toStage: "verify",
											note: "PR merged — advancing to verify",
										})
									}
								>
									PR merged → verify
								</Button>
							)}
							{item.stage !== "rejected" && item.stage !== "done" && (
								<Button
									size="sm"
									variant="ghost"
									disabled={transition.isPending}
									onClick={() =>
										transition.mutate({
											itemId: item.id,
											expectedRevision: item.revision,
											toStage: "rejected",
										})
									}
								>
									Reject
								</Button>
							)}
						</div>

						<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4">
							<span className="text-xs font-medium text-muted-foreground">
								Evidence chain
							</span>
							{data.runs.length === 0 && (
								<p className="text-xs text-muted-foreground">
									No runs yet. Press Run to dispatch the first stage agent.
								</p>
							)}
							{data.runs.map((run) => (
								<FactoryRunEntry
									key={run.id}
									run={run}
									onOpenWorkspace={() => openWorkspace(run)}
								/>
							))}
						</div>
					</>
				)}
			</SheetContent>
		</Sheet>
	);
}
