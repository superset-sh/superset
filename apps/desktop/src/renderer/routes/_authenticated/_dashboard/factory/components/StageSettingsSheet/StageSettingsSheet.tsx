import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@superset/ui/sheet";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { useMutation } from "@tanstack/react-query";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { AGENT_STAGES_UI, type FactoryRow } from "../../constants";
import { StageCard } from "./components/StageCard";

interface StageSettingsSheetProps {
	factory: FactoryRow | undefined;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function StageSettingsSheet({
	factory,
	open,
	onOpenChange,
}: StageSettingsSheetProps) {
	const { data: prompts } = cloudTrpc.factory.listPrompts.useQuery(
		{ factoryId: factory?.id ?? "" },
		{ enabled: !!factory && open },
	);
	const { data: improve } = cloudTrpc.factory.improveStatus.useQuery(
		{ factoryId: factory?.id ?? "" },
		{ enabled: !!factory && open, refetchInterval: open ? 5_000 : false },
	);
	const utils = cloudTrpc.useUtils();
	const setAutoAdvance = useMutation({
		mutationFn: (autoAdvance: boolean) =>
			apiTrpcClient.factory.update.mutate({
				id: factory?.id ?? "",
				autoAdvance,
			}),
		onSuccess: (updated) => {
			toast.success(
				updated.autoAdvance
					? "Auto-advance on — successful stages dispatch the next agent"
					: "Auto-advance off — stages wait for a human Run",
			);
			void utils.factory.list.invalidate();
		},
		onError: (error) => toast.error(error.message),
	});

	if (!factory) return null;

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="flex w-[560px] flex-col gap-0 sm:max-w-[560px]">
				<SheetHeader className="shrink-0">
					<SheetTitle>Stage settings</SheetTitle>
					<SheetDescription>
						Each stage runs its own agent with its own instructions. Flagged
						runs feed the self-learning loop: the improve agent drafts a new
						version, you approve it.
					</SheetDescription>
				</SheetHeader>
				<div className="mx-4 flex shrink-0 items-center gap-3 rounded-lg border border-border px-3.5 py-2.5">
					<div className="flex flex-1 flex-col">
						<span className="text-sm font-medium">Auto-advance</span>
						<span className="text-xs text-muted-foreground">
							Successful stages dispatch the next agent; new issues start
							classify automatically. Human review stays gated.
						</span>
					</div>
					<Switch
						checked={factory.autoAdvance}
						disabled={setAutoAdvance.isPending}
						onCheckedChange={(checked) => setAutoAdvance.mutate(checked)}
						aria-label="Auto-advance stages"
					/>
				</div>
				<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4">
					{AGENT_STAGES_UI.map((stage) => (
						<StageCard
							key={stage}
							factory={factory}
							stage={stage}
							versions={(prompts?.versions ?? []).filter(
								(v) => v.stage === stage,
							)}
							defaultPrompt={prompts?.defaults?.[stage] ?? ""}
							signalCount={improve?.signalCounts?.[stage] ?? 0}
							latestImproveRun={
								improve?.improveRuns?.find((run) => run.stage === stage) ?? null
							}
						/>
					))}
				</div>
			</SheetContent>
		</Sheet>
	);
}
