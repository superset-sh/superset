import { Button } from "@superset/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { LuFactory, LuPlus, LuSettings2 } from "react-icons/lu";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { AddIssuesDialog } from "./components/AddIssuesDialog";
import { CreateFactoryDialog } from "./components/CreateFactoryDialog";
import { FactoryBoard } from "./components/FactoryBoard";
import { FactoryItemSheet } from "./components/FactoryItemSheet";
import { FactoryMetricsView } from "./components/FactoryMetricsView";
import { FactoryStatCards } from "./components/FactoryStatCards";
import { NeedsAttentionStrip } from "./components/NeedsAttentionStrip";
import { StageSettingsSheet } from "./components/StageSettingsSheet";

export const Route = createFileRoute("/_authenticated/_dashboard/factory/")({
	component: FactoryPage,
});

function FactoryPage() {
	const utils = cloudTrpc.useUtils();
	const {
		data: factories,
		isPending,
		error: listError,
		refetch: refetchFactories,
	} = cloudTrpc.factory.list.useQuery(undefined, { refetchInterval: 30_000 });
	const [selectedFactoryId, setSelectedFactoryId] = useState<string | null>(
		null,
	);
	const factory =
		factories?.find((f) => f.id === selectedFactoryId) ?? factories?.[0];

	const { data: board } = cloudTrpc.factory.listItems.useQuery(
		{ factoryId: factory?.id ?? "" },
		{ enabled: !!factory, refetchInterval: 5_000 },
	);
	const { data: stats } = cloudTrpc.factory.stats.useQuery(
		{ factoryId: factory?.id ?? "" },
		{ enabled: !!factory, refetchInterval: 30_000 },
	);

	const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
	const [createOpen, setCreateOpen] = useState(false);
	const [addIssuesOpen, setAddIssuesOpen] = useState(false);
	const [stageSettingsOpen, setStageSettingsOpen] = useState(false);
	const [view, setView] = useState<"board" | "metrics">("board");

	const runStage = useMutation({
		mutationFn: (input: { itemId: string; expectedRevision: number }) =>
			apiTrpcClient.factory.runStage.mutate(input),
		onSuccess: (result) => {
			toast.success(`Dispatched ${result.stage} agent`);
			void utils.factory.listItems.invalidate();
			void utils.factory.getItem.invalidate();
		},
		onError: (error) => toast.error(error.message),
	});

	return (
		<div className="flex h-full flex-1 flex-col overflow-hidden">
			<div className="drag h-10 shrink-0" />
			<div className="flex min-h-0 flex-1 flex-col gap-4 px-6 pb-6">
				<div className="flex shrink-0 items-center gap-3">
					<h1 className="text-xl font-semibold">Factory</h1>
					{factories && factories.length > 0 && (
						<>
							<Select
								value={factory?.id}
								onValueChange={(value) => setSelectedFactoryId(value)}
							>
								<SelectTrigger className="h-8 w-56">
									<SelectValue placeholder="Select a factory" />
								</SelectTrigger>
								<SelectContent>
									{factories.map((f) => (
										<SelectItem key={f.id} value={f.id}>
											{f.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<span className="text-xs text-muted-foreground">
								{factory?.repoFullName}
							</span>
							<div className="ml-2 flex rounded-md border border-border p-0.5">
								{(["board", "metrics"] as const).map((v) => (
									<button
										key={v}
										type="button"
										onClick={() => setView(v)}
										aria-pressed={view === v}
										className={`rounded px-2 py-0.5 text-xs capitalize transition-colors ${
											view === v
												? "bg-fill-selected text-foreground"
												: "text-muted-foreground hover:text-foreground"
										}`}
									>
										{v}
									</button>
								))}
							</div>
							<div className="flex-1" />
							<Button
								size="sm"
								variant="outline"
								onClick={() => setStageSettingsOpen(true)}
							>
								<LuSettings2 className="size-3.5" />
								Stages
							</Button>
							<Button
								size="sm"
								variant="outline"
								onClick={() => setAddIssuesOpen(true)}
							>
								<LuPlus className="size-3.5" />
								Add issues
							</Button>
							<Button
								size="sm"
								variant="outline"
								onClick={() => setCreateOpen(true)}
							>
								New factory
							</Button>
						</>
					)}
				</div>

				{listError && !factories && (
					<div className="flex flex-1 flex-col items-center justify-center gap-3">
						<p className="max-w-md select-text cursor-text text-center text-sm text-red-600 dark:text-red-400">
							{listError.message}
						</p>
						<Button variant="outline" onClick={() => void refetchFactories()}>
							Retry
						</Button>
					</div>
				)}

				{!isPending && factories?.length === 0 && (
					<div className="flex flex-1 flex-col items-center justify-center gap-3">
						<LuFactory className="size-10 text-muted-foreground" />
						<p className="max-w-md text-center text-sm text-muted-foreground">
							A factory pushes GitHub issues through per-stage agents —
							classify, analyze, implement, review — to a human-gated PR, on
							your own hosts.
						</p>
						<Button onClick={() => setCreateOpen(true)}>
							<LuPlus className="size-4" />
							Create a factory
						</Button>
					</div>
				)}

				{factory && view === "board" && <FactoryStatCards stats={stats} />}

				{factory && board && view === "board" && (
					<NeedsAttentionStrip
						items={board.items}
						latestRuns={board.latestRuns}
						onOpenItem={(itemId) => setSelectedItemId(itemId)}
					/>
				)}

				{factory && board && view === "board" && (
					<FactoryBoard
						items={board.items}
						latestRuns={board.latestRuns}
						onOpenItem={(itemId) => setSelectedItemId(itemId)}
						onRunItem={(item) =>
							runStage.mutate({
								itemId: item.id,
								expectedRevision: item.revision,
							})
						}
						runPending={runStage.isPending}
					/>
				)}

				{factory && board && view === "metrics" && (
					<FactoryMetricsView factoryId={factory.id} items={board.items} />
				)}
			</div>

			<CreateFactoryDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				onCreated={(factoryId) => {
					setSelectedFactoryId(factoryId);
					void utils.factory.list.invalidate();
				}}
			/>
			{factory && (
				<AddIssuesDialog
					open={addIssuesOpen}
					onOpenChange={setAddIssuesOpen}
					factoryId={factory.id}
					projectId={factory.v2ProjectId}
					repoFullName={factory.repoFullName}
					onAdded={() => void utils.factory.listItems.invalidate()}
				/>
			)}
			<StageSettingsSheet
				factory={factory}
				open={stageSettingsOpen}
				onOpenChange={setStageSettingsOpen}
			/>
			<FactoryItemSheet
				itemId={selectedItemId}
				onClose={() => setSelectedItemId(null)}
				onRunItem={(item) =>
					runStage.mutate({ itemId: item.id, expectedRevision: item.revision })
				}
				runPending={runStage.isPending}
			/>
		</div>
	);
}
