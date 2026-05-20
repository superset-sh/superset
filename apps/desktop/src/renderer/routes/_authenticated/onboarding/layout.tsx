import { ChatServiceProvider } from "@superset/chat/client";
import {
	createFileRoute,
	Navigate,
	Outlet,
	useLocation,
	useNavigate,
} from "@tanstack/react-router";
import { useMemo } from "react";
import { createChatServiceIpcClient } from "renderer/components/Chat/utils/chat-service-client";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider";
import { OnboardingNavigation } from "./components/OnboardingNavigation";

export const Route = createFileRoute("/_authenticated/onboarding")({
	component: OnboardingFlowLayout,
});

const STEPS = [
	{
		path: "/onboarding",
		match: (p: string) => p === "/onboarding",
	},
	{
		path: "/onboarding/project",
		match: (p: string) => p === "/onboarding/project",
	},
	{
		path: "/onboarding/prompt",
		match: (p: string) => p.startsWith("/onboarding/prompt/"),
	},
] as const;

function OnboardingFlowLayout() {
	const { data: session, isPending } = authClient.useSession();
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const isMac = platform === undefined || platform === "darwin";
	const chatClient = useMemo(() => createChatServiceIpcClient(), []);
	const location = useLocation();
	const navigate = useNavigate();

	if (isPending) return null;
	if (session?.user?.onboardedAt) {
		return <Navigate to="/" replace />;
	}

	const currentStepIdx = STEPS.findIndex((s) => s.match(location.pathname));
	const isOnMainStep = currentStepIdx >= 0;
	const isFirstStep = currentStepIdx === 0;

	const handleBack = () => {
		if (currentStepIdx <= 0) return;
		const target = STEPS[currentStepIdx - 1];
		if (!target) return;
		// Step 3 has a dynamic param — go back to step 2 to re-pick a project.
		navigate({ to: target.path });
	};

	// Layout owns Continue only on step 1 (dashboard); steps 2 and 3 manage
	// their own primary action since it depends on per-page state (project id,
	// prompt input).
	const handleContinue = isFirstStep
		? () => navigate({ to: "/onboarding/project" })
		: null;

	return (
		<ChatServiceProvider client={chatClient} queryClient={electronQueryClient}>
			<div className="flex h-full w-full flex-col bg-background">
				<div
					className="drag h-12 w-full shrink-0"
					style={{ paddingLeft: isMac ? "88px" : "16px" }}
				/>
				<div className="flex-1 overflow-auto">
					<Outlet />
				</div>
				{isOnMainStep && (
					<OnboardingNavigation
						currentStep={currentStepIdx}
						totalSteps={STEPS.length}
						onBack={isFirstStep ? null : handleBack}
						onContinue={handleContinue}
						continueLabel="Continue"
					/>
				)}
			</div>
		</ChatServiceProvider>
	);
}
