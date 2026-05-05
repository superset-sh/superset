import { Spinner } from "@superset/ui/spinner";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { FaGithub } from "react-icons/fa";
import { LuCheck, LuExternalLink, LuRefreshCw } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { STEP_ROUTES, useOnboardingStore } from "renderer/stores/onboarding";
import { SetupButton } from "../components/SetupButton";
import { StepHeader, StepShell } from "../components/StepShell";

export const Route = createFileRoute("/_authenticated/setup/gh-cli/")({
	component: OnboardingGhCliPage,
});

function OnboardingGhCliPage() {
	const navigate = useNavigate();
	const goTo = useOnboardingStore((s) => s.goTo);
	const markComplete = useOnboardingStore((s) => s.markComplete);
	const markSkipped = useOnboardingStore((s) => s.markSkipped);
	const completed = useOnboardingStore((s) => s.completed["gh-cli"]);
	const skipped = useOnboardingStore((s) => s.skipped["gh-cli"]);
	const manualWalkthrough = useOnboardingStore((s) => s.manualWalkthrough);

	const {
		data: ghStatus,
		isPending,
		isFetching,
		refetch,
	} = electronTrpc.system.detectGhCli.useQuery();

	useEffect(() => {
		goTo("gh-cli");
	}, [goTo]);

	const shouldAutoAdvance =
		!completed &&
		!skipped &&
		!manualWalkthrough &&
		ghStatus?.installed === true;

	useEffect(() => {
		if (shouldAutoAdvance) {
			markComplete("gh-cli");
			navigate({ to: STEP_ROUTES.permissions, replace: true });
		}
	}, [shouldAutoAdvance, markComplete, navigate]);

	const handleSkip = () => {
		markSkipped("gh-cli");
		navigate({ to: STEP_ROUTES.permissions });
	};
	const handleContinue = () => {
		markComplete("gh-cli");
		navigate({ to: STEP_ROUTES.permissions });
	};

	if (isPending || shouldAutoAdvance) {
		return (
			<div className="flex h-full w-full items-center justify-center bg-[#151110]">
				<Spinner className="size-6 text-[#a8a5a3]" />
			</div>
		);
	}

	if (ghStatus?.installed) {
		return (
			<StepShell backTo={STEP_ROUTES.providers}>
				<StepHeader
					icon={
						<div className="relative">
							<div className="flex size-14 items-center justify-center rounded-2xl bg-[#eae8e6] text-[#151110]">
								<FaGithub className="size-7" />
							</div>
							<div className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full border-2 border-[#151110] bg-emerald-500 text-white">
								<LuCheck className="size-3" strokeWidth={3} />
							</div>
						</div>
					}
					title="GitHub CLI is installed"
					subtitle="You're ready to check out PRs and manage issues from Superset."
				/>

				<div className="overflow-hidden rounded-lg border border-[#2a2827] bg-[#201e1c]">
					<DetailRow
						label="Version"
						value={ghStatus.version ? `gh ${ghStatus.version}` : "Unknown"}
					/>
					{ghStatus.path && (
						<DetailRow label="Location" value={ghStatus.path} mono />
					)}
				</div>

				<div className="flex w-[273px] flex-col gap-2 self-center">
					<SetupButton onClick={handleContinue}>Continue</SetupButton>
					<SetupButton variant="link" onClick={handleSkip}>
						Skip for now
					</SetupButton>
				</div>
			</StepShell>
		);
	}

	return (
		<StepShell backTo={STEP_ROUTES.providers}>
			<StepHeader
				title="Install GitHub CLI"
				subtitle="Superset uses gh for GitHub operations like checking out PRs and managing issues."
			/>

			<div className="space-y-3 rounded-lg border border-[#2a2827] bg-[#201e1c] p-4">
				<InstallOption
					title="Install with Homebrew"
					command="brew install gh"
				/>
				<a
					href="https://cli.github.com/"
					target="_blank"
					rel="noopener noreferrer"
					className="flex items-center justify-between gap-3 rounded-md bg-[#151110] px-3 py-2 text-[12px] text-[#eae8e6] transition-colors hover:bg-[#2a2827]"
				>
					<span>Or download directly (macOS, Windows, Linux)</span>
					<LuExternalLink className="size-3.5 text-[#a8a5a3]" />
				</a>
			</div>

			<div className="flex w-[273px] flex-col gap-2 self-center">
				<SetupButton
					variant="secondary"
					onClick={() => refetch()}
					disabled={isFetching}
				>
					<span className="inline-flex items-center justify-center gap-1.5">
						<LuRefreshCw
							className={`size-3.5${isFetching ? " animate-spin" : ""}`}
						/>
						Recheck
					</span>
				</SetupButton>
				<SetupButton variant="link" onClick={handleSkip}>
					Skip for now
				</SetupButton>
			</div>
		</StepShell>
	);
}

function InstallOption({ title, command }: { title: string; command: string }) {
	return (
		<div className="space-y-1.5">
			<p className="text-[12px] font-medium text-[#eae8e6]">{title}</p>
			<div className="flex items-center gap-2 rounded-md border border-[#2a2827] bg-[#151110] px-3 py-2 font-mono text-[11px]">
				<span className="text-[#a8a5a3]">$</span>
				<code className="flex-1 text-[#eae8e6]">{command}</code>
			</div>
		</div>
	);
}

function DetailRow({
	label,
	value,
	mono,
}: {
	label: string;
	value: string;
	mono?: boolean;
}) {
	return (
		<div className="flex items-center justify-between gap-4 border-[#2a2827] border-b px-4 py-3 last:border-b-0">
			<span className="text-[10px] font-medium uppercase tracking-wide text-[#a8a5a3]">
				{label}
			</span>
			<span
				className={
					mono
						? "truncate font-mono text-[11px] text-[#eae8e6]"
						: "text-[12px] text-[#eae8e6]"
				}
			>
				{value}
			</span>
		</div>
	);
}
