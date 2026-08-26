import { useNavigate } from "@tanstack/react-router";
import type { SidebarCardEntry } from "renderer/components/SidebarCardSlot";
import { electronTrpc } from "renderer/lib/electron-trpc";

export function useSetupScriptCard({
	projectId,
	projectName,
}: {
	projectId: string | null;
	projectName: string | null;
}): SidebarCardEntry | null {
	const { data: shouldShow } = electronTrpc.config.shouldShowSetupCard.useQuery(
		{ projectId: projectId ?? "" },
		{ enabled: !!projectId, refetchOnWindowFocus: true },
	);
	const dismissMutation = electronTrpc.config.dismissSetupCard.useMutation();
	const utils = electronTrpc.useUtils();
	const navigate = useNavigate();

	if (!projectId || !projectName || !shouldShow) return null;

	return {
		// Project-scoped so switching projects re-keys the animation, matching
		// the `key={projectId}` the card carried before the slot owned it.
		id: `setup-script:${projectId}`,
		badge: "Setup",
		title: "Lifecycle scripts",
		description: `Automate workspace setup for ${projectName}`,
		actionLabel: "Configure",
		onAction: () =>
			navigate({
				to: "/settings/projects/$projectId",
				params: { projectId },
			}),
		onDismiss: () =>
			dismissMutation.mutate(
				{ projectId },
				{
					onSuccess: () =>
						utils.config.shouldShowSetupCard.invalidate({ projectId }),
				},
			),
	};
}
