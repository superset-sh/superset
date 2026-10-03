import {
	buildTeleportPlan,
	type TeleportPlan,
} from "@superset/shared/teleport";
import {
	runTeleport,
	type TeleportOperations,
} from "@superset/shared/teleport-driver";
import { useCallback, useRef, useState } from "react";
import type { TeleportDestination, TeleportRunState } from "../../types";

/**
 * Dialog state for one workspace: which destination, what the plan says,
 * and how far a run has got.
 *
 * The orchestration itself lives in `runTeleport`, which is pure and
 * elsewhere. This hook only turns its progress callbacks into React state
 * and holds the plan — so the ordering logic stays testable without a
 * renderer, and this stays small enough to read.
 */

export interface UseTeleportInput {
	workspaceId: string;
	branch: string | null;
	/** Builds the operations for a chosen destination. */
	createOperations: (host: TeleportDestination) => TeleportOperations;
	/** Gathers what the review dialog needs, for a chosen destination. */
	loadPlanInputs: (host: TeleportDestination) => Promise<{
		destinationHasRepository: boolean;
		workingTree: TeleportPlan["workingTree"];
		tabs: TeleportPlan["tabs"];
		refusals: TeleportPlan["refusals"];
	}>;
}

const EMPTY_RUN: TeleportRunState = { steps: {}, error: null };

export function useTeleport({
	workspaceId,
	branch,
	createOperations,
	loadPlanInputs,
}: UseTeleportInput) {
	const [plan, setPlan] = useState<TeleportPlan | null>(null);
	const [run, setRun] = useState<TeleportRunState>(EMPTY_RUN);
	const [destinationWorkspaceId, setDestinationWorkspaceId] = useState<
		string | null
	>(null);

	// A destination change while a plan is loading must not let the older
	// response win and describe the wrong host.
	const planRequest = useRef(0);

	const chooseDestination = useCallback(
		async (host: TeleportDestination) => {
			const request = ++planRequest.current;
			setPlan(null);
			const inputs = await loadPlanInputs(host);
			if (request !== planRequest.current) return;
			setPlan(
				buildTeleportPlan({
					branch: branch ?? "",
					destinationHostName: host.name,
					...inputs,
				}),
			);
		},
		[branch, loadPlanInputs],
	);

	const start = useCallback(
		async (host: TeleportDestination) => {
			setRun({ steps: {}, error: null });
			const result = await runTeleport(
				createOperations(host),
				({ step, state, error }) => {
					setRun((previous) => ({
						steps: { ...previous.steps, [step]: state },
						error: error ?? previous.error,
					}));
				},
			);
			setDestinationWorkspaceId(result.destinationWorkspaceId);
			return result;
		},
		[createOperations],
	);

	const reset = useCallback(() => {
		planRequest.current++;
		setPlan(null);
		setRun(EMPTY_RUN);
		setDestinationWorkspaceId(null);
	}, []);

	return {
		workspaceId,
		plan,
		run,
		destinationWorkspaceId,
		chooseDestination,
		start,
		reset,
	};
}
