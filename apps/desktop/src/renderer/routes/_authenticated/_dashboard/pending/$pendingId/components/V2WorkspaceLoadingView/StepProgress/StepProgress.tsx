import { cn } from "@superset/ui/utils";
import { useEffect, useState } from "react";
import {
	getStepIndex,
	INIT_STEP_MESSAGES,
	INIT_STEP_ORDER,
	type WorkspaceInitStep,
} from "shared/types/workspace-init";
import "./StepProgress.css";

const DONE_HOLD_MS = 750;

const DISPLAY_STEPS: readonly WorkspaceInitStep[] = INIT_STEP_ORDER.filter(
	(s) => s !== "ready",
);

type StepState = "waiting" | "progress" | "done";

interface StepProgressProps {
	currentStep: WorkspaceInitStep;
}

export function StepProgress({ currentStep }: StepProgressProps) {
	const targetIdx = getStepIndex(currentStep);
	const [renderIdx, setRenderIdx] = useState(targetIdx);
	const [holdDoneIdx, setHoldDoneIdx] = useState<number | null>(null);

	useEffect(() => {
		if (targetIdx === renderIdx) {
			setHoldDoneIdx(null);
			return;
		}
		if (targetIdx < renderIdx) {
			setRenderIdx(targetIdx);
			setHoldDoneIdx(null);
			return;
		}
		setHoldDoneIdx(renderIdx);
		const t = window.setTimeout(() => {
			setHoldDoneIdx(null);
			setRenderIdx((prev) => Math.min(prev + 1, targetIdx));
		}, DONE_HOLD_MS);
		return () => window.clearTimeout(t);
	}, [targetIdx, renderIdx]);

	return (
		<div className="step-progress" aria-live="polite">
			<div className="step-progress__list">
				{DISPLAY_STEPS.map((step) => {
					const idx = getStepIndex(step);
					const distance = idx - renderIdx;
					const isHeldDone = holdDoneIdx === idx;
					const state: StepState = isHeldDone
						? "done"
						: distance < 0
							? "done"
							: distance === 0
								? "progress"
								: "waiting";
					const fade = Math.abs(distance);

					return (
						<div
							key={step}
							className="step-progress__item text-foreground/85"
							style={{
								transform: `translateY(${distance * 100}%)`,
								opacity: Math.max(0, 1 - fade * 0.35),
							}}
						>
							<span
								className={cn(
									"step-progress__icon",
									state === "waiting" && "text-muted-foreground/50",
									state === "progress" && "text-orange-500",
									state === "done" && "text-green-500",
								)}
							>
								<StepIcon state={state} />
							</span>
							<span className="step-progress__title">
								{stripEllipsis(INIT_STEP_MESSAGES[step])}
								{state === "progress" ? <Ellipsis /> : null}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function stripEllipsis(s: string) {
	return s.replace(/[.…]+$/, "");
}

function StepIcon({ state }: { state: StepState }) {
	if (state === "done") {
		return <CheckCircle />;
	}
	if (state === "progress") {
		return <HalfCircle />;
	}
	return <EmptyCircle />;
}

function CheckCircle() {
	return (
		<svg
			width="1em"
			height="1em"
			viewBox="0 0 16 16"
			aria-hidden="true"
			role="presentation"
		>
			<circle fill="currentColor" cx="8" cy="8" r="8" />
			<polyline
				className="step-progress__check-stroke"
				fill="none"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="1.75"
				points="4 8,7 11,12 5"
			/>
		</svg>
	);
}

function EmptyCircle() {
	const angles = Array.from({ length: 16 }, (_, i) => (360 / 16) * i);
	return (
		<svg
			width="1em"
			height="1em"
			viewBox="0 0 16 16"
			aria-hidden="true"
			role="presentation"
		>
			<g fill="currentColor" transform="translate(8,8)">
				{angles.map((a) => (
					<rect
						key={a}
						x="-1"
						width="2"
						height="2"
						transform={`rotate(${a}) translate(0,6)`}
					/>
				))}
			</g>
		</svg>
	);
}

function HalfCircle() {
	return (
		<svg
			width="1em"
			height="1em"
			viewBox="0 0 16 16"
			aria-hidden="true"
			role="presentation"
		>
			<circle
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				cx="8"
				cy="8"
				r="7"
			/>
			<path fill="currentColor" d="M8 3 A5 5 0 0 1 8 13 Z" />
		</svg>
	);
}

function Ellipsis() {
	return (
		<span className="step-progress__ellipsis" aria-hidden="true">
			<span className="step-progress__ellipsis-dot">.</span>
			<span className="step-progress__ellipsis-dot">.</span>
			<span className="step-progress__ellipsis-dot">.</span>
		</span>
	);
}
