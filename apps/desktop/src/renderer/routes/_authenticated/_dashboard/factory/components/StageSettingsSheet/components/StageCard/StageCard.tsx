import type { RouterOutputs } from "@superset/trpc";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { LuSparkles } from "react-icons/lu";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import {
	type AgentStageUI,
	type FactoryRow,
	STAGE_LABELS,
} from "../../../../constants";

type PromptVersion =
	RouterOutputs["factory"]["listPrompts"]["versions"][number];
type ImproveRun =
	RouterOutputs["factory"]["improveStatus"]["improveRuns"][number];

interface StageCardProps {
	factory: FactoryRow;
	stage: AgentStageUI;
	versions: PromptVersion[];
	defaultPrompt: string;
	signalCount: number;
	latestImproveRun: ImproveRun | null;
}

export function StageCard({
	factory,
	stage,
	versions,
	defaultPrompt,
	signalCount,
	latestImproveRun,
}: StageCardProps) {
	const utils = cloudTrpc.useUtils();
	const active = versions.find((v) => v.status === "active") ?? null;
	const draft = versions.find((v) => v.status === "draft") ?? null;
	const stageConfig = factory.stageConfig?.[stage];

	const [prompt, setPrompt] = useState<string | null>(null);
	const [agent, setAgent] = useState<string | null>(null);
	const [model, setModel] = useState<string | null>(null);
	const [draftExpanded, setDraftExpanded] = useState(false);

	const promptValue = prompt ?? active?.content ?? defaultPrompt;
	const promptDirty = promptValue !== (active?.content ?? defaultPrompt);
	const agentValue = agent ?? stageConfig?.agent ?? "";
	const modelValue = model ?? stageConfig?.model ?? "";
	const configDirty =
		agentValue !== (stageConfig?.agent ?? "") ||
		modelValue !== (stageConfig?.model ?? "");

	const invalidate = () => {
		void utils.factory.listPrompts.invalidate();
		void utils.factory.improveStatus.invalidate();
		void utils.factory.list.invalidate();
	};

	const savePrompt = useMutation({
		mutationFn: () =>
			apiTrpcClient.factory.setStagePrompt.mutate({
				factoryId: factory.id,
				stage,
				content: promptValue,
			}),
		onSuccess: (created) => {
			toast.success(
				`${STAGE_LABELS[stage]} instructions saved as v${created.version}`,
			);
			setPrompt(null);
			invalidate();
		},
		onError: (error) => toast.error(error.message),
	});

	const saveConfig = useMutation({
		mutationFn: () =>
			apiTrpcClient.factory.update.mutate({
				id: factory.id,
				stageConfig: {
					...factory.stageConfig,
					[stage]: {
						...(agentValue ? { agent: agentValue } : {}),
						...(modelValue ? { model: modelValue } : {}),
					},
				},
			}),
		onSuccess: () => {
			toast.success(`${STAGE_LABELS[stage]} agent settings saved`);
			setAgent(null);
			setModel(null);
			invalidate();
		},
		onError: (error) => toast.error(error.message),
	});

	const runImprove = useMutation({
		mutationFn: () =>
			apiTrpcClient.factory.runImprove.mutate({
				factoryId: factory.id,
				stage,
			}),
		onSuccess: () => {
			toast.success(`Improve agent dispatched for ${STAGE_LABELS[stage]}`);
			invalidate();
		},
		onError: (error) => toast.error(error.message),
	});

	const activateDraft = useMutation({
		mutationFn: (promptId: string) =>
			apiTrpcClient.factory.activatePrompt.mutate({ promptId }),
		onSuccess: (activated) => {
			toast.success(
				`v${activated.version} is now active for ${STAGE_LABELS[stage]}`,
			);
			setPrompt(null);
			invalidate();
		},
		onError: (error) => toast.error(error.message),
	});

	const discardDraft = useMutation({
		mutationFn: (promptId: string) =>
			apiTrpcClient.factory.discardPrompt.mutate({ promptId }),
		onSuccess: () => {
			toast.success("Draft discarded");
			invalidate();
		},
		onError: (error) => toast.error(error.message),
	});

	return (
		<div className="flex flex-col gap-2.5 rounded-lg border border-border p-3">
			<div className="flex items-center gap-2">
				<span className="text-sm font-medium">{STAGE_LABELS[stage]}</span>
				<span className="rounded bg-fill-secondary px-1.5 py-px text-[10px] text-muted-foreground">
					{active ? `custom v${active.version}` : "default instructions"}
				</span>
				<span className="flex-1" />
				{signalCount > 0 && (
					<span className="rounded bg-amber-500/15 px-1.5 py-px text-[10px] font-medium text-amber-600 dark:text-amber-400">
						{signalCount} flagged run{signalCount === 1 ? "" : "s"}
					</span>
				)}
			</div>

			<Textarea
				value={promptValue}
				onChange={(event) => setPrompt(event.target.value)}
				rows={6}
				className="font-mono text-xs"
				aria-label={`${STAGE_LABELS[stage]} instructions`}
			/>
			<div className="flex items-center gap-2">
				<Button
					size="sm"
					variant="outline"
					className="h-6 px-2 text-[11px]"
					disabled={!promptDirty || savePrompt.isPending}
					onClick={() => savePrompt.mutate()}
				>
					Save as v{(versions[0]?.version ?? 0) + 1}
				</Button>
				{promptDirty && (
					<Button
						size="sm"
						variant="ghost"
						className="h-6 px-2 text-[11px]"
						onClick={() => setPrompt(null)}
					>
						Revert
					</Button>
				)}
				<span className="flex-1" />
				<Input
					value={agentValue}
					onChange={(event) => setAgent(event.target.value)}
					placeholder={factory.defaultAgent}
					aria-label={`${STAGE_LABELS[stage]} agent`}
					className="h-6 w-24 px-2 text-[11px]"
				/>
				<Input
					value={modelValue}
					onChange={(event) => setModel(event.target.value)}
					placeholder="model"
					aria-label={`${STAGE_LABELS[stage]} model`}
					className="h-6 w-24 px-2 text-[11px]"
				/>
				<Button
					size="sm"
					variant="outline"
					className="h-6 px-2 text-[11px]"
					disabled={!configDirty || saveConfig.isPending}
					onClick={() => saveConfig.mutate()}
				>
					Save agent
				</Button>
			</div>

			<div className="flex flex-col gap-2 rounded-md bg-fill-secondary/40 p-2">
				<div className="flex items-center gap-2">
					<LuSparkles className="size-3 text-muted-foreground" />
					<span className="text-[11px] font-medium text-muted-foreground">
						Self-learning
					</span>
					<span className="flex-1" />
					<Button
						size="sm"
						variant="outline"
						className="h-6 gap-1 px-2 text-[11px]"
						disabled={signalCount === 0 || runImprove.isPending}
						title={
							signalCount === 0
								? "Mark runs flawed (or leave feedback) to give the improve agent something to learn from"
								: undefined
						}
						onClick={() => runImprove.mutate()}
					>
						<LuSparkles className="size-3" />
						Draft improvement
					</Button>
				</div>
				{latestImproveRun && latestImproveRun.status !== "reported" && (
					<p className="select-text cursor-text text-[11px] text-muted-foreground">
						Improve run {latestImproveRun.status.replace("_", " ")}
						{latestImproveRun.error ? ` — ${latestImproveRun.error}` : "…"}
					</p>
				)}
				{draft && (
					<div className="flex flex-col gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
						<div className="flex items-center gap-2">
							<span className="text-[11px] font-medium">
								Draft v{draft.version}
								{draft.authoredBy === "agent"
									? " · proposed by improve agent"
									: ""}
							</span>
							<span className="flex-1" />
							<Button
								size="sm"
								className="h-5 px-2 text-[11px]"
								disabled={activateDraft.isPending}
								onClick={() => activateDraft.mutate(draft.id)}
							>
								Approve
							</Button>
							<Button
								size="sm"
								variant="ghost"
								className="h-5 px-2 text-[11px]"
								disabled={discardDraft.isPending}
								onClick={() => discardDraft.mutate(draft.id)}
							>
								Discard
							</Button>
						</div>
						<button
							type="button"
							className="text-left"
							onClick={() => setDraftExpanded((expanded) => !expanded)}
						>
							<pre
								className={`select-text cursor-text overflow-x-auto whitespace-pre-wrap rounded bg-background/60 p-2 text-[11px] leading-snug ${draftExpanded ? "" : "line-clamp-4"}`}
							>
								{draft.content}
							</pre>
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
