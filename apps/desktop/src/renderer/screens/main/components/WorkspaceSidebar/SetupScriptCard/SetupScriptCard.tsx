import { SidebarCard } from "@superset/ui/sidebar-card";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface SetupScriptCardProps {
	isCollapsed?: boolean;
	projectId: string | null;
	projectName: string | null;
}

export function SetupScriptCard({
	isCollapsed,
	projectId,
	projectName,
}: SetupScriptCardProps) {
	const { data: shouldShow } =
		electronTrpc.config.shouldShowConfigToast.useQuery(
			{ projectId: projectId ?? "" },
			{ enabled: !!projectId, refetchOnWindowFocus: true },
		);

	const dismissMutation = electronTrpc.config.dismissConfigToast.useMutation();
	const utils = electronTrpc.useUtils();
	const navigate = useNavigate();

	if (isCollapsed) return null;

	const visible = !!projectId && !!projectName && !!shouldShow;

	const handleDismiss = () => {
		if (!projectId) return;
		dismissMutation.mutate(
			{ projectId },
			{
				onSuccess: () =>
					utils.config.shouldShowConfigToast.invalidate({ projectId }),
			},
		);
	};

	return (
		<AnimatePresence>
			{visible && (
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
						onAction={() => {
							if (projectId) {
								navigate({
									to: "/settings/project/$projectId",
									params: { projectId },
								});
							}
						}}
						onDismiss={handleDismiss}
					/>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
