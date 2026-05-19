import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { HiArrowLeft } from "react-icons/hi2";
import { LuCheck, LuChevronDown } from "react-icons/lu";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import {
	ONBOARDING_STEP_ORDER,
	type OnboardingStep,
	STEP_ROUTES,
	useOnboardingStore,
} from "renderer/stores/onboarding";
import { useSetupChromeStore } from "../StepShell";

const SKIP_TARGET = "/workspace" as const;

const STEP_LABELS: Record<OnboardingStep, string> = {
	providers: "AI providers",
	"gh-cli": "GitHub CLI",
	permissions: "Permissions",
	project: "Project",
};

export function OnboardingProgress() {
	const navigate = useNavigate();
	const currentStep = useOnboardingStore((s) => s.currentStep);
	const completed = useOnboardingStore((s) => s.completed);
	const skipped = useOnboardingStore((s) => s.skipped);
	const skipUntilNextLaunch = useOnboardingStore((s) => s.skipUntilNextLaunch);
	const dismissForever = useOnboardingStore((s) => s.dismissForever);
	const isV2 = useIsV2CloudEnabled();
	const backTo = useSetupChromeStore((s) => s.backTo);
	const currentIdx = ONBOARDING_STEP_ORDER.indexOf(currentStep);

	function handleSkipForNow() {
		skipUntilNextLaunch();
		void navigate({ to: SKIP_TARGET });
	}

	function handleDismissForever() {
		dismissForever();
		void navigate({ to: SKIP_TARGET });
	}

	const pillBase =
		"inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors";

	return (
		<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 pt-6 pb-4">
			<div className="flex items-center justify-start">
				{backTo && (
					<button
						type="button"
						onClick={() => navigate({ to: backTo })}
						className={cn(
							pillBase,
							"border-transparent text-[#a8a5a3] hover:bg-white/5 hover:text-[#eae8e6]",
						)}
					>
						<HiArrowLeft className="size-3.5" />
						Back
					</button>
				)}
			</div>

			<div className="flex items-center justify-center gap-2">
				{ONBOARDING_STEP_ORDER.map((step, idx) => {
					const isDone = completed[step] || skipped[step];
					const isCurrent = step === currentStep;
					const isPast = idx < currentIdx;
					const isClickable = (isDone || isPast) && !isCurrent;

					const content = (
						<>
							{isDone ? (
								<LuCheck className="size-3.5" strokeWidth={2.5} />
							) : (
								<span className="font-mono text-[11px] tabular-nums">
									{idx + 1}
								</span>
							)}
							<span>{STEP_LABELS[step]}</span>
						</>
					);

					const stateClasses = isCurrent
						? "border-[#3a3735] bg-[#201e1c] text-[#eae8e6]"
						: isClickable
							? "border-transparent text-[#a8a5a3] hover:bg-white/5 hover:text-[#eae8e6] cursor-pointer"
							: "border-transparent text-[#a8a5a3]/50 cursor-default";

					return (
						<div key={step} className="flex items-center gap-2">
							{isClickable ? (
								<button
									type="button"
									onClick={() => navigate({ to: STEP_ROUTES[step] })}
									className={cn(pillBase, stateClasses)}
								>
									{content}
								</button>
							) : (
								<div className={cn(pillBase, stateClasses)}>{content}</div>
							)}
							{idx < ONBOARDING_STEP_ORDER.length - 1 && (
								<div
									aria-hidden
									className={cn(
										"h-px w-4",
										idx < currentIdx ? "bg-[#3a3735]" : "bg-[#2a2827]/60",
									)}
								/>
							)}
						</div>
					);
				})}
			</div>

			<div className="flex items-center justify-end">
				{isV2 && (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								className={cn(
									pillBase,
									"border-transparent text-[#a8a5a3] hover:bg-white/5 hover:text-[#eae8e6]",
								)}
							>
								Skip
								<LuChevronDown className="size-3.5" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-56">
							<DropdownMenuItem onClick={handleSkipForNow}>
								<div className="flex flex-col">
									<span>Skip for now</span>
									<span className="text-[11px] text-muted-foreground">
										Ask again next launch
									</span>
								</div>
							</DropdownMenuItem>
							<DropdownMenuItem onClick={handleDismissForever}>
								<div className="flex flex-col">
									<span>Don't show again</span>
									<span className="text-[11px] text-muted-foreground">
										Hide until reset in Settings
									</span>
								</div>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</div>
		</div>
	);
}
