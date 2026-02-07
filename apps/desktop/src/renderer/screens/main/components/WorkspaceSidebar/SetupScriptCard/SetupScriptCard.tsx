import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { LuX } from "react-icons/lu";
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
					<div className="relative rounded-lg border border-border bg-card p-3">
						<Badge variant="box">Setup</Badge>

						<button
							type="button"
							onClick={handleDismiss}
							className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-foreground transition-colors"
						>
							<LuX className="size-3.5" />
						</button>

						<p className="text-sm font-semibold mt-2 text-card-foreground">
							Setup scripts
						</p>
						<p className="text-xs text-muted-foreground mt-1 leading-snug">
							Automate workspace setup for {projectName}
						</p>

						<Button
							variant="outline"
							size="sm"
							className="mt-3 w-full h-7 text-xs"
							onClick={() => {
								if (projectId) {
									navigate({
										to: "/settings/project/$projectId",
										params: { projectId },
									});
								}
							}}
						>
							Configure
						</Button>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
