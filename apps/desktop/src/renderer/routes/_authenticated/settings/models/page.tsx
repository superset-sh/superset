import { ChatServiceProvider } from "@superset/chat/client";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { createChatServiceIpcClient } from "renderer/components/Chat/utils/chat-service-client";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getVisibleSettingIdsForSection } from "../utils/settings-search";
import { ModelsSettings } from "./components/ModelsSettings";

export const Route = createFileRoute("/_authenticated/settings/models/")({
	component: ModelsSettingsPage,
});

const chatServiceIpcClient = createChatServiceIpcClient();

function ModelsSettingsPage() {
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(
		() => getVisibleSettingIdsForSection(searchQuery, "models"),
		[searchQuery],
	);

	return (
		<ChatServiceProvider
			client={chatServiceIpcClient}
			queryClient={electronQueryClient}
		>
			<ModelsSettings visibleItems={visibleItems} />
		</ChatServiceProvider>
	);
}
