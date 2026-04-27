import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
	INIT_STEP_ORDER,
	type WorkspaceInitStep,
} from "shared/types/workspace-init";
import { KeypadLoader } from "./KeypadLoader";
import { StepProgress } from "./StepProgress";

interface V2WorkspaceLoadingViewProps {
	workspaceName?: string;
	title?: string;
	description?: string;
	children?: ReactNode;
	/**
	 * Drives the keypad directly. When omitted, the loader cycles through
	 * steps on a short timer so the keys still animate even with no real
	 * backend progress data (e.g. adopt intent, cold-load route).
	 */
	currentStep?: WorkspaceInitStep;
}

const VISIBLE_STEPS: readonly WorkspaceInitStep[] = INIT_STEP_ORDER.filter(
	(s) => s !== "ready",
);

const STEP_INTERVAL_MS = 400;

export function V2WorkspaceLoadingView({
	workspaceName,
	title = "Loading workspace",
	description = "Hang tight while we get things ready",
	children,
	currentStep: currentStepProp,
}: V2WorkspaceLoadingViewProps) {
	const [stepIdx, setStepIdx] = useState(0);

	useEffect(() => {
		if (currentStepProp !== undefined) return;
		const id = window.setInterval(() => {
			setStepIdx((prev) => Math.min(prev + 1, VISIBLE_STEPS.length - 1));
		}, STEP_INTERVAL_MS);
		return () => window.clearInterval(id);
	}, [currentStepProp]);

	const currentStep = currentStepProp ?? VISIBLE_STEPS[stepIdx] ?? "pending";

	return (
		<div className="flex flex-col items-center justify-center h-full w-full px-8">
			<div className="flex flex-col items-center max-w-md text-center space-y-5">
				<KeypadLoader currentStep={currentStep} />

				<div className="space-y-1">
					<h2 className="text-lg font-medium text-foreground">{title}</h2>
					{workspaceName ? (
						<p className="text-sm text-muted-foreground">{workspaceName}</p>
					) : null}
				</div>

				<StepProgress currentStep={currentStep} />

				<p className="text-xs text-muted-foreground/60">{description}</p>

				{children}
			</div>
		</div>
	);
}
