import { COMPANY } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { HiArrowLeft } from "react-icons/hi2";
import { LuCircleHelp } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { PaginationDots } from "../PaginationDots";

interface OnboardingNavigationProps {
	currentStep: number;
	totalSteps: number;
	onBack: (() => void) | null;
	onContinue: (() => void) | null;
	onSkip: (() => void) | null;
	skipDisabled?: boolean;
	continueLabel: string;
}

export function OnboardingNavigation({
	currentStep,
	totalSteps,
	onBack,
	onContinue,
	onSkip,
	skipDisabled,
	continueLabel,
}: OnboardingNavigationProps) {
	const openUrl = electronTrpc.external.openUrl.useMutation();

	return (
		<div className="border-t border-border">
			{/* Same max-w / px as the step content so Back and Continue line up
			    with the column edges above them. */}
			<div className="mx-auto flex w-full max-w-2xl items-center gap-4 px-8 py-4">
				<div className="flex flex-1 items-center justify-start gap-1">
					{onBack && (
						<Button size="sm" variant="ghost" onClick={onBack}>
							<HiArrowLeft />
							Back
						</Button>
					)}
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								size="icon-sm"
								variant="ghost"
								className="text-muted-foreground"
								aria-label="Get support"
								onClick={() => openUrl.mutate(COMPANY.REPORT_ISSUE_URL)}
							>
								<LuCircleHelp />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Get support</TooltipContent>
					</Tooltip>
				</div>

				<PaginationDots current={currentStep} total={totalSteps} />

				<div className="flex flex-1 items-center justify-end gap-2">
					{onSkip && (
						<Button
							size="sm"
							variant="ghost"
							className="text-muted-foreground"
							onClick={onSkip}
							disabled={skipDisabled}
						>
							Skip for now
						</Button>
					)}
					{onContinue && (
						<Button size="sm" onClick={onContinue}>
							{continueLabel}
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}
