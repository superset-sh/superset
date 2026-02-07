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
						<span className="inline-block text-[10px] font-medium uppercase tracking-wider bg-primary/15 text-primary px-1.5 py-0.5 rounded">
							Setup
						</span>

						<button
							type="button"
							onClick={handleDismiss}
							className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-foreground transition-colors"
						>
							<LuX className="size-3.5" />
						</button>

						<p className="text-sm font-semibold mt-2">Setup scripts</p>
						<p className="text-sm text-muted-foreground mt-1 leading-snug">
							Automate workspace setup for {projectName}
						</p>

						<button
							type="button"
							onClick={() => {
								if (projectId) {
									navigate({
										to: "/settings/project/$projectId",
										params: { projectId },
									});
								}
							}}
							className="text-xs text-primary hover:underline mt-1.5"
						>
							Configure
						</button>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
