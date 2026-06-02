interface StepProgressProps {
	currentIndex: number;
	totalSteps: number;
}

export function getStepProgress({
	currentIndex,
	totalSteps,
}: StepProgressProps) {
	const safeTotalSteps = Math.max(totalSteps, 1);
	const safeCurrentIndex = Math.min(
		Math.max(currentIndex, 0),
		safeTotalSteps - 1,
	);
	const currentStep = safeCurrentIndex + 1;

	return {
		currentStep,
		totalSteps: safeTotalSteps,
		percent: (currentStep / safeTotalSteps) * 100,
		label: `Step ${currentStep} of ${safeTotalSteps}`,
	};
}

export function StepProgress(props: StepProgressProps) {
	const progress = getStepProgress(props);

	return (
		<div
			role="progressbar"
			aria-label={progress.label}
			aria-valuemin={1}
			aria-valuemax={progress.totalSteps}
			aria-valuenow={progress.currentStep}
			className="pointer-events-none absolute -top-px left-0 h-px w-full overflow-hidden"
		>
			<div
				className="h-full bg-foreground transition-[width] duration-200"
				style={{ width: `${progress.percent}%` }}
			/>
		</div>
	);
}
