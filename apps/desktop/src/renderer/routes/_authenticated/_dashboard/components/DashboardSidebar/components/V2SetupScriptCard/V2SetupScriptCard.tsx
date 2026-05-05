import { SidebarCard } from "@superset/ui/sidebar-card";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useV2SetupCardDismissalsStore } from "renderer/stores/v2-setup-card-dismissals";

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
	const navigate = useNavigate();
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
					onAction={() =>
						navigate({
							to: "/settings/projects/$projectId",
							params: { projectId },
						})
					}
					onDismiss={() => dismiss(projectId)}
				/>
			</motion.div>
		</AnimatePresence>
	);
}
