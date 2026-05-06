import { chatServiceTrpc } from "@superset/chat/client";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AnthropicOAuthDialog } from "renderer/components/Chat/ChatInterface/components/ModelPicker/components/AnthropicOAuthDialog";
import { useAnthropicOAuth } from "renderer/components/Chat/ChatInterface/components/ModelPicker/hooks/useAnthropicOAuth";
import { track } from "renderer/lib/analytics";
import { useOnboardingStore } from "renderer/stores/onboarding";
import { SetupButton } from "../../components/SetupButton";
import {
	StepHeader,
	StepShell,
	SupersetPill,
} from "../../components/StepShell";
import { ClaudeBrandIcon } from "../components/ClaudeBrandIcon";
import { SupersetIcon } from "../components/SupersetIcon";

export const Route = createFileRoute(
	"/_authenticated/setup/providers/claude-code/",
)({
	component: ConnectClaudeCodePage,
});

function ConnectClaudeCodePage() {
	const navigate = useNavigate();
	const goTo = useOnboardingStore((s) => s.goTo);

	const { data: status, refetch } =
		chatServiceTrpc.auth.getAnthropicStatus.useQuery();

	const { isStartingOAuth, startAnthropicOAuth, oauthDialog } =
		useAnthropicOAuth({
			isModelSelectorOpen: true,
			onModelSelectorOpenChange: () => {},
			onAuthStateChange: async () => {
				const result = await refetch();
				if (result.data?.authenticated && !result.data.issue) {
					track("onboarding_provider_connected", {
						provider: "anthropic",
						method: "oauth",
					});
					navigate({ to: "/setup/providers", replace: true });
				}
			},
		});

	const isAuthenticated = !!status?.authenticated && !status.issue;

	useEffect(() => {
		goTo("providers");
	}, [goTo]);

	const handleConnect = () => {
		void startAnthropicOAuth();
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
							<div className="flex size-[44px] items-center justify-center rounded-[10px] bg-[#151110]">
								<SupersetIcon className="w-7" />
							</div>
							<ClaudeBrandIcon
								className="size-[44px] rounded-[10px]"
								iconClassName="size-7"
							/>
						</SupersetPill>
					}
					title="Connect Claude Code"
					subtitle="Authorize access to your account"
				/>

				<div className="flex w-[273px] flex-col gap-2 self-center">
					<SetupButton
						onClick={handleConnect}
						disabled={isStartingOAuth || oauthDialog.isPreparing}
					>
						{isStartingOAuth || oauthDialog.isPreparing
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

			<AnthropicOAuthDialog {...oauthDialog} />
		</>
	);
}
