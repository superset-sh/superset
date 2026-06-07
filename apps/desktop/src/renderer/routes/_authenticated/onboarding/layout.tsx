import { ChatServiceProvider } from "@superset/chat/client";
import { toast } from "@superset/ui/sonner";
import {
	createFileRoute,
	Navigate,
	Outlet,
	useLocation,
	useNavigate,
} from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { createChatServiceIpcClient } from "renderer/components/Chat/utils/chat-service-client";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { track } from "renderer/lib/analytics";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider";
import { OnboardingNavigation } from "./components/OnboardingNavigation";

export const Route = createFileRoute("/_authenticated/onboarding")({
	component: OnboardingFlowLayout,
	validateSearch: (search: Record<string, unknown>): { rerun?: boolean } => ({
		rerun: search.rerun === true ? true : undefined,
	}),
});

const STEPS = [
	{
		path: "/onboarding",
		match: (p: string) => p === "/onboarding",
		title: "Setup Superset",
		subtitle: "Connect your agents and tools to get started.",
	},
	{
		path: "/onboarding/project",
		match: (p: string) => p === "/onboarding/project",
		title: "Point Superset at some code",
		subtitle: "Open a folder or clone a repo to finish setup.",
	},
] as const;

function OnboardingFlowLayout() {
	const {
		data: session,
		isPending,
		refetch: refetchSession,
	} = authClient.useSession();
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const isMac = platform === undefined || platform === "darwin";
	const chatClient = useMemo(() => createChatServiceIpcClient(), []);
	const location = useLocation();
	const navigate = useNavigate();
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const [skipping, setSkipping] = useState(false);
	const { rerun } = Route.useSearch();

	if (isPending) return null;
	// Already-onboarded users are redirected out — unless they explicitly
	// relaunched the flow from Settings (?rerun=true).
	if (session?.user?.onboardedAt && !rerun) {
		return <Navigate to="/" replace />;
	}

	const currentStepIdx = STEPS.findIndex((s) => s.match(location.pathname));
	const isOnMainStep = currentStepIdx >= 0;
	const isFirstStep = currentStepIdx === 0;
	const currentStep = isOnMainStep ? STEPS[currentStepIdx] : null;

	const handleBack = () => {
		if (currentStepIdx <= 0) return;
		const target = STEPS[currentStepIdx - 1];
		if (!target) return;
		navigate({ to: target.path });
	};

	// Step 1 advances to the project step; the project step finishes onboarding
	// itself the moment a project is added, so it has no footer Continue.
	const handleContinue = isFirstStep
		? () => navigate({ to: "/onboarding/project" })
		: null;

	// Skip is always available, including on the required gh-cli step — setup is
	// non-blocking. It marks the user onboarded so the _authenticated gate stops
	// redirecting here; unfinished steps can be completed later from Settings.
	const handleSkip = async () => {
		setSkipping(true);
		track("onboarding_finished", { outcome: "skipped" });
		try {
			await apiTrpcClient.user.completeOnboarding.mutate();
			// Reactive refetch so the layout guards' useSession() sees onboardedAt
			// before we navigate — otherwise the _authenticated guard bounces us back.
			await refetchSession({ query: { disableCookieCache: true } });
		} catch (error) {
			console.error("[onboarding] skip failed", error);
			toast.error("Could not skip setup. Please try again.");
			setSkipping(false);
			return;
		}
		await navigate({
			to: isV2CloudEnabled ? "/v2-workspaces" : "/workspaces",
			replace: true,
		});
	};

	return (
		<ChatServiceProvider client={chatClient} queryClient={electronQueryClient}>
			<div className="flex h-full w-full flex-col bg-background">
				<div
					className="drag h-12 w-full shrink-0"
					style={{ paddingLeft: isMac ? "88px" : "16px" }}
				/>
				<div className="flex-1 overflow-auto">
					{currentStep ? (
						<div className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-8 pt-16 pb-6">
							<div className="space-y-2">
								<h1 className="text-2xl font-semibold text-foreground">
									{currentStep.title}
								</h1>
								<p className="text-sm text-muted-foreground">
									{currentStep.subtitle}
								</p>
							</div>
							<Outlet />
						</div>
					) : (
						<Outlet />
					)}
				</div>
				{isOnMainStep && (
					<OnboardingNavigation
						currentStep={currentStepIdx}
						totalSteps={STEPS.length}
						onBack={isFirstStep ? null : handleBack}
						onContinue={handleContinue}
						onSkip={handleSkip}
						skipDisabled={skipping}
						continueLabel="Continue"
					/>
				)}
			</div>
		</ChatServiceProvider>
	);
}
