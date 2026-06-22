import { COMPANY } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import { HiArrowLeft } from "react-icons/hi2";
import { LuCircleHelp } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { PaginationDots } from "../PaginationDots";

interface OnboardingNavigationProps {
	currentStep: number;
	totalSteps: number;
	onBack: (() => void) | null;
	onContinue: (() => void) | null;
	continueDisabled?: boolean;
	continueLabel: string;
}

export function OnboardingNavigation({
	currentStep,
	totalSteps,
	onBack,
	onContinue,
	continueDisabled,
	continueLabel,
}: OnboardingNavigationProps) {
	const openUrl = electronTrpc.external.openUrl.useMutation();

	return (
		<div className="mx-auto flex w-full max-w-[1200px] items-center px-12 pt-4 pb-8">
			<div className="flex flex-1 justify-start">
				<div className="w-[160px]">
					{onBack && (
						<Button
							size="sm"
							variant="ghost"
							className="w-full"
							onClick={onBack}
						>
							<HiArrowLeft />
							Back
						</Button>
					)}
				</div>
			</div>
			<div className="flex flex-1 justify-center">
				<PaginationDots current={currentStep} total={totalSteps} />
			</div>
			<div className="flex flex-1 items-center justify-end gap-2">
				<Button
					size="sm"
					variant="ghost"
					onClick={() => openUrl.mutate(COMPANY.REPORT_ISSUE_URL)}
				>
					<LuCircleHelp />
					Get support
				</Button>
				{onContinue && (
					<Button
						size="sm"
						className="w-[160px]"
						onClick={onContinue}
						disabled={continueDisabled}
					>
						{continueLabel}
					</Button>
				)}
			</div>
		</div>
	);
}
