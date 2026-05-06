import { Spinner } from "@superset/ui/spinner";
import { cn } from "@superset/ui/utils";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { LuCircleCheck, LuExternalLink, LuShieldCheck } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { STEP_ROUTES, useOnboardingStore } from "renderer/stores/onboarding";
import { SetupButton } from "../components/SetupButton";
import { StepHeader, StepShell } from "../components/StepShell";

export const Route = createFileRoute("/_authenticated/setup/permissions/")({
	component: OnboardingPermissionsPage,
});

interface PermissionRowProps {
	title: string;
	description: string;
	required?: boolean;
	granted: boolean | null;
	onRequest: () => void;
	pending: boolean;
}

function OnboardingPermissionsPage() {
	const navigate = useNavigate();
	const goTo = useOnboardingStore((s) => s.goTo);
	const markComplete = useOnboardingStore((s) => s.markComplete);
	const markSkipped = useOnboardingStore((s) => s.markSkipped);

	const { data: status, isPending } =
		electronTrpc.permissions.getStatus.useQuery(undefined, {
			refetchInterval: 2000,
		});

	const requestFda =
		electronTrpc.permissions.requestFullDiskAccess.useMutation();
	const requestA11y =
		electronTrpc.permissions.requestAccessibility.useMutation();
	const requestMic = electronTrpc.permissions.requestMicrophone.useMutation();

	useEffect(() => {
		goTo("permissions");
	}, [goTo]);

	const fdaGranted = status?.fullDiskAccess ?? false;
	const a11yGranted = status?.accessibility ?? false;
	const micGranted = status?.microphone ?? false;
	const requiredSatisfied = fdaGranted && a11yGranted;

	const handleContinue = () => {
		if (!requiredSatisfied) return;
		markComplete("permissions");
		navigate({ to: STEP_ROUTES.project });
	};

	const handleSkip = () => {
		markSkipped("permissions");
		navigate({ to: STEP_ROUTES.project });
	};

	if (isPending) {
		return (
			<div className="flex h-full w-full items-center justify-center bg-[#151110]">
				<Spinner className="size-6 text-[#a8a5a3]" />
			</div>
		);
	}

	return (
		<StepShell backTo={STEP_ROUTES["gh-cli"]} maxWidth="lg">
			<StepHeader
				title="Grant macOS permissions"
				subtitle="Superset needs these to read your repos and drive your terminal."
			/>

			<div className="overflow-hidden rounded-lg border border-[#2a2827] bg-[#201e1c]">
				<SectionLabel>Required</SectionLabel>
				<PermissionRow
					title="Full Disk Access"
					description="Read your project files."
					required
					granted={fdaGranted}
					onRequest={() => requestFda.mutate()}
					pending={requestFda.isPending}
				/>
				<PermissionRow
					title="Accessibility"
					description="Drive the terminal and editor on your behalf."
					required
					granted={a11yGranted}
					onRequest={() => requestA11y.mutate()}
					pending={requestA11y.isPending}
				/>

				<SectionLabel>Recommended</SectionLabel>
				<PermissionRow
					title="Microphone"
					description="Voice input in chat (optional)."
					granted={micGranted}
					onRequest={() => requestMic.mutate()}
					pending={requestMic.isPending}
				/>
			</div>

			<div className="flex w-[273px] flex-col gap-2 self-center">
				<SetupButton onClick={handleContinue} disabled={!requiredSatisfied}>
					Continue
				</SetupButton>
				<SetupButton variant="link" onClick={handleSkip}>
					Skip for now
				</SetupButton>
			</div>
		</StepShell>
	);
}

function SectionLabel({ children }: { children: React.ReactNode }) {
	return (
		<p className="border-[#2a2827] border-b bg-[#151110] px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-[#a8a5a3]">
			{children}
		</p>
	);
}

function PermissionRow({
	title,
	description,
	required,
	granted,
	onRequest,
	pending,
}: PermissionRowProps) {
	const isKnownGranted = granted === true;
	return (
		<div className="flex items-center gap-3 border-[#2a2827] border-b px-4 py-3 last:border-b-0">
			<div
				className={cn(
					"flex size-8 shrink-0 items-center justify-center rounded-md",
					isKnownGranted
						? "bg-emerald-500/10 text-emerald-400"
						: "bg-[#151110] text-[#a8a5a3]",
				)}
			>
				{isKnownGranted ? (
					<LuCircleCheck className="size-4" />
				) : (
					<LuShieldCheck className="size-4" />
				)}
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<p className="text-[12px] font-medium text-[#eae8e6]">{title}</p>
					{required && (
						<span className="rounded-md bg-[#151110] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[#a8a5a3]">
							Required
						</span>
					)}
				</div>
				<p className="text-[11px] text-[#a8a5a3]">{description}</p>
			</div>
			<button
				type="button"
				onClick={onRequest}
				disabled={pending}
				className={cn(
					"inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors",
					isKnownGranted ? "text-[#a8a5a3]" : "text-[#eae8e6] hover:bg-white/5",
				)}
			>
				{isKnownGranted ? (
					"Granted"
				) : (
					<>
						Open Settings
						<LuExternalLink className="size-3" />
					</>
				)}
			</button>
		</div>
	);
}
