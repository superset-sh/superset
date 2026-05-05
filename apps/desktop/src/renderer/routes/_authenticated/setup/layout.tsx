import { ChatServiceProvider } from "@superset/chat/client";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useMemo } from "react";
import { createChatServiceIpcClient } from "renderer/components/Chat/utils/chat-service-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider";
import { OnboardingProgress } from "./components/OnboardingProgress";

export const Route = createFileRoute("/_authenticated/setup")({
	component: OnboardingFlowLayout,
});

function OnboardingFlowLayout() {
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const isMac = platform === undefined || platform === "darwin";
	const chatClient = useMemo(() => createChatServiceIpcClient(), []);

	return (
		<ChatServiceProvider client={chatClient} queryClient={electronQueryClient}>
			<div className="flex flex-col h-full w-full bg-[#151110]">
				<div
					className="drag h-12 w-full shrink-0"
					style={{ paddingLeft: isMac ? "88px" : "16px" }}
				/>
				<OnboardingProgress />
				<div className="flex-1 overflow-auto">
					<Outlet />
				</div>
			</div>
		</ChatServiceProvider>
	);
}
