import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { HiMiniXMark } from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";

interface UpdateToastProps {
	toastId: string | number;
	version: string;
	releaseUrl: string;
	onDismiss?: () => void;
}

export function UpdateToast({
	toastId,
	version,
	releaseUrl,
	onDismiss,
}: UpdateToastProps) {
	const openUrl = trpc.external.openUrl.useMutation();
	const installUpdate = trpc.autoUpdate.installUpdate.useMutation();

	const handleSeeChanges = () => {
		openUrl.mutate(releaseUrl);
	};

	const handleRestart = () => {
		installUpdate.mutate();
	};

	const handleDismiss = () => {
		toast.dismiss(toastId);
		onDismiss?.();
	};

	return (
		<div className="relative flex items-center gap-4 bg-popover text-popover-foreground rounded-lg border border-border p-4 pr-5 shadow-lg min-w-[420px]">
			<button
				type="button"
				onClick={handleDismiss}
				className="absolute -top-2 -left-2 size-5 flex items-center justify-center rounded-full bg-popover border border-border text-muted-foreground hover:text-foreground transition-colors"
				aria-label="Dismiss"
			>
				<HiMiniXMark className="size-3" />
			</button>
			<div className="flex flex-col gap-0.5 flex-1">
				<span className="font-medium text-sm">New update available</span>
				<span className="text-sm text-muted-foreground">
					Restart to use the latest.
				</span>
			</div>
			<div className="flex items-center gap-2 shrink-0">
				<Button variant="outline" size="sm" onClick={handleSeeChanges}>
					See changes
				</Button>
				<Button size="sm" onClick={handleRestart}>
					Restart
				</Button>
			</div>
		</div>
	);
}
