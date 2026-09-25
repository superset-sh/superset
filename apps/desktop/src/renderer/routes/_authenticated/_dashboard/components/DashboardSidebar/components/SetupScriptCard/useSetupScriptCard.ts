import { useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import type { SidebarCardEntry } from "renderer/components/SidebarCardSlot";
import { useOpenNewWorkspace } from "renderer/hooks/useOpenNewWorkspace";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useNewWorkspaceDraftStore } from "renderer/stores/new-workspace-draft";
import { useSetupCardDismissalsStore } from "renderer/stores/setup-card-dismissals";
import setupScriptPrompt from "./setup-script-prompt.md?raw";

export function useSetupScriptCard({
	hostUrl,
	projectId,
	projectName,
}: {
	hostUrl: string | null;
	projectId: string | null;
	projectName: string | null;
}): SidebarCardEntry | null {
	const { t } = useLingui();
	const openNewWorkspace = useOpenNewWorkspace();
	const isDismissed = useSetupCardDismissalsStore((s) =>
		projectId ? s.isDismissed(projectId) : false,
	);
	const dismiss = useSetupCardDismissalsStore((s) => s.dismiss);

	const { data: shouldShow } = useQuery({
		queryKey: ["host-config", "shouldShowSetupCard", hostUrl, projectId],
		queryFn: () => {
			if (!hostUrl || !projectId) throw new Error("no active host or project");
			return getHostServiceClientByUrl(
				hostUrl,
			).config.shouldShowSetupCard.query({ projectId });
		},
		enabled: !!hostUrl && !!projectId,
		refetchOnWindowFocus: true,
	});

	if (!hostUrl || !projectId || !projectName || isDismissed || !shouldShow) {
		return null;
	}

	return {
		id: `setup-script:${projectId}`,
		badge: t({
			message: "Setup",
		}),
		title: t({
			message: "Lifecycle scripts",
		}),
		description: t({
			message: `Automate workspace setup for ${projectName}`,
		}),
		actionLabel: t({
			message: "Configure",
		}),
		// Configure → open the new-workspace modal seeded with a prompt that walks
		// the agent through writing setup/teardown scripts for this project, rather
		// than sending the user to the settings page to hand-write config.json.
		onAction: () => {
			const draftStore = useNewWorkspaceDraftStore.getState();
			draftStore.resetDraft();
			draftStore.updateDraft({ prompt: setupScriptPrompt });
			openNewWorkspace(projectId);
		},
		onDismiss: () => dismiss(projectId),
	};
}
