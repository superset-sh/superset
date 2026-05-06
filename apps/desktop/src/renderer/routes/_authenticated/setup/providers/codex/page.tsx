import { chatServiceTrpc } from "@superset/chat/client";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { OpenAIOAuthDialog } from "renderer/components/Chat/ChatInterface/components/ModelPicker/components/OpenAIOAuthDialog";
import { useOpenAIOAuth } from "renderer/components/Chat/ChatInterface/components/ModelPicker/hooks/useOpenAIOAuth";
import { track } from "renderer/lib/analytics";
import { useOnboardingStore } from "renderer/stores/onboarding";
import { SetupButton } from "../../components/SetupButton";
import {
	StepHeader,
	StepShell,
	SupersetPill,
} from "../../components/StepShell";
import { CodexBrandIcon } from "../components/CodexBrandIcon";
import { SupersetIcon } from "../components/SupersetIcon";

export const Route = createFileRoute("/_authenticated/setup/providers/codex/")({
	component: ConnectCodexPage,
});

function ConnectCodexPage() {
	const navigate = useNavigate();
	const goTo = useOnboardingStore((s) => s.goTo);

	const { data: status } = chatServiceTrpc.auth.getOpenAIStatus.useQuery();
	const { isStartingOAuth, startOpenAIOAuth, oauthDialog } = useOpenAIOAuth({
		isModelSelectorOpen: true,
		onModelSelectorOpenChange: () => {},
	});

	const isAuthenticated = !!status?.authenticated && !status.issue;

	const wasAuthedOnMount = useRef<boolean | null>(null);
	useEffect(() => {
		if (status !== undefined && wasAuthedOnMount.current === null) {
			wasAuthedOnMount.current = isAuthenticated;
		}
	}, [status, isAuthenticated]);

	useEffect(() => {
		goTo("providers");
	}, [goTo]);

	useEffect(() => {
		if (wasAuthedOnMount.current === false && isAuthenticated) {
			track("onboarding_provider_connected", {
				provider: "openai",
				method: "oauth",
			});
			navigate({ to: "/setup/providers", replace: true });
		}
	}, [isAuthenticated, navigate]);

	const handleConnect = () => {
		void startOpenAIOAuth();
	};
	const handleCancel = () => {
		navigate({ to: "/setup/providers" });
	};

	return (
		<>
			<StepShell backTo="/setup/providers">
				<StepHeader
					icon={
						<SupersetPill>
							<div className="flex size-[42px] items-center justify-center rounded-full bg-[#151110]">
								<SupersetIcon className="size-5 text-[#eae8e6]" />
							</div>
							<CodexBrandIcon
								className="size-[42px] rounded-full bg-[#eae8e6]"
								iconClassName="size-7 text-[#151110]"
							/>
						</SupersetPill>
					}
					title="Connect Codex"
					subtitle="Authorize access to your account"
				/>

				<div className="flex w-[273px] flex-col gap-2 self-center">
					<SetupButton onClick={handleConnect} disabled={isStartingOAuth}>
						{isStartingOAuth
							? "Preparing…"
							: isAuthenticated
								? "Reconnect"
								: "Connect"}
					</SetupButton>
					{isAuthenticated && (
						<SetupButton variant="link" onClick={handleCancel}>
							Cancel — keep current
						</SetupButton>
					)}
				</div>
			</StepShell>

			<OpenAIOAuthDialog {...oauthDialog} />
		</>
	);
}
