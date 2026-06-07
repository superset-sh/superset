import { SidebarCard } from "@superset/ui/sidebar-card";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useNewWorkspaceDraftStore } from "renderer/stores/new-workspace-draft";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import { useV2SetupCardDismissalsStore } from "renderer/stores/v2-setup-card-dismissals";
import setupScriptPrompt from "./setup-script-prompt.md?raw";

interface V2SetupScriptCardProps {
	hostUrl: string;
	projectId: string;
	projectName: string;
	isCollapsed?: boolean;
}

export function V2SetupScriptCard({
	hostUrl,
	projectId,
	projectName,
	isCollapsed,
}: V2SetupScriptCardProps) {
	const openNewWorkspaceModal = useOpenNewWorkspaceModal();
	const isDismissed = useV2SetupCardDismissalsStore((s) =>
		s.isDismissed(projectId),
	);
	const dismiss = useV2SetupCardDismissalsStore((s) => s.dismiss);

	const { data: shouldShow } = useQuery({
		queryKey: ["host-config", "shouldShowSetupCard", hostUrl, projectId],
		queryFn: () =>
			getHostServiceClientByUrl(hostUrl).config.shouldShowSetupCard.query({
				projectId,
			}),
		refetchOnWindowFocus: true,
	});

	if (isCollapsed || isDismissed || !shouldShow) return null;

	// Configure → open the new-workspace modal seeded with a prompt that walks
	// the agent through writing setup/teardown scripts for this project, rather
	// than sending the user to the settings page to hand-write config.json.
	const handleConfigure = () => {
		const draftStore = useNewWorkspaceDraftStore.getState();
		draftStore.resetDraft();
		draftStore.updateDraft({ prompt: setupScriptPrompt });
		openNewWorkspaceModal(projectId);
	};

	return (
		<AnimatePresence>
			<motion.div
				key={projectId}
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
				exit={{ opacity: 0, y: 10 }}
				transition={{ duration: 0.2 }}
				className="px-3 pb-2"
			>
				<SidebarCard
					badge="Setup"
					title="Setup scripts"
					description={`Automate workspace setup for ${projectName}`}
					actionLabel="Configure"
					onAction={handleConfigure}
					onDismiss={() => dismiss(projectId)}
				/>
			</motion.div>
		</AnimatePresence>
	);
}
