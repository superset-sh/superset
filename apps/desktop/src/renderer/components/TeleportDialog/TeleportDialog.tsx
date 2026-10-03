import { Trans } from "@lingui/react/macro";
import type { TeleportPlan } from "@superset/shared/teleport";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { TeleportHostStep } from "./components/TeleportHostStep";
import { TeleportPlanStep } from "./components/TeleportPlanStep";
import { TeleportProgressStep } from "./components/TeleportProgressStep";
import type {
	TeleportDestination,
	TeleportPhase,
	TeleportRunState,
} from "./types";
import { deriveRunOutcome } from "./utils/runOutcome";

interface TeleportDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** The workspace being moved, for the dialog's subtitle. */
	workspaceLabel: string;
	/** Resolved once a destination is chosen; null while it loads. */
	plan: TeleportPlan | null;
	run: TeleportRunState;
	onDestinationChosen: (host: TeleportDestination) => void;
	onConfirm: (host: TeleportDestination) => void;
	onOpenThere: (host: TeleportDestination) => void;
}

/**
 * The phase machine, and nothing else.
 *
 * Every piece of content lives in a step component, so this file stays
 * readable as the sequence it describes: pick, review, run. The dialog owns
 * no data of its own — a caller supplies the plan and the run state — which
 * is what lets the steps be rendered in isolation.
 */
export function TeleportDialog({
	open,
	onOpenChange,
	workspaceLabel,
	plan,
	run,
	onDestinationChosen,
	onConfirm,
	onOpenThere,
}: TeleportDialogProps) {
	const [phase, setPhase] = useState<TeleportPhase>({ kind: "picking" });
	const [selected, setSelected] = useState<TeleportDestination | null>(null);
	const outcome = deriveRunOutcome(run);
	const inFlight = phase.kind === "running" && outcome === "running";

	// A run must not be interrupted by an accidental click outside: the work
	// continues either way, but a dialog that vanishes mid-transfer reads as
	// a crash.
	const dismissible = !inFlight;

	function reset() {
		setPhase({ kind: "picking" });
		setSelected(null);
	}

	function close() {
		onOpenChange(false);
		reset();
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next && !dismissible) return;
				if (!next) reset();
				onOpenChange(next);
			}}
		>
			<DialogContent className="max-w-[480px] gap-4">
				<DialogHeader className="flex-row items-start gap-3 space-y-0">
					<span
						aria-hidden="true"
						className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border text-muted-foreground"
					>
						<ExternalLink className="size-3.5" />
					</span>
					<div className="min-w-0">
						<DialogTitle className="text-left text-[15px]">
							{phase.kind === "picking" ? (
								<Trans>Teleport</Trans>
							) : (
								<Trans>Teleport to {phase.host.name}</Trans>
							)}
						</DialogTitle>
						<DialogDescription className="text-left">
							{inFlight ? (
								<Trans>Safe to close — this continues in the background</Trans>
							) : (
								workspaceLabel
							)}
						</DialogDescription>
					</div>
				</DialogHeader>

				{phase.kind === "picking" && (
					<TeleportHostStep
						selectedHostId={selected?.id ?? null}
						onSelect={setSelected}
						onCancel={close}
						onReview={() => {
							if (!selected) return;
							setPhase({ kind: "reviewing", host: selected });
							onDestinationChosen(selected);
						}}
					/>
				)}

				{phase.kind === "reviewing" && (
					<TeleportPlanStep
						plan={plan}
						hostName={phase.host.name}
						onBack={() => setPhase({ kind: "picking" })}
						onConfirm={() => {
							setPhase({ kind: "running", host: phase.host });
							onConfirm(phase.host);
						}}
					/>
				)}

				{phase.kind === "running" && (
					<TeleportProgressStep
						run={run}
						hostName={phase.host.name}
						isDone={outcome === "done"}
						onClose={close}
						onOpenThere={() => {
							onOpenThere(phase.host);
							close();
						}}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}
