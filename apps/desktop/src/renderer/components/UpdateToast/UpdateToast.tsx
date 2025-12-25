import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { HiMiniXMark } from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";

interface UpdateToastProps {
	toastId: string | number;
	version: string;
	releaseUrl: string;
}

export function UpdateToast({
	toastId,
	version,
	releaseUrl,
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
	};

	return (
		<div className="flex items-center gap-4">
			<div className="flex flex-col gap-0.5 flex-1 min-w-0">
				<span className="font-medium text-foreground">
					New update available
				</span>
				<span className="text-sm text-muted-foreground">
					Restart to use v{version}.
				</span>
			</div>
			<div className="flex items-center gap-2 shrink-0">
				<Button variant="outline" size="sm" onClick={handleSeeChanges}>
					See changes
				</Button>
				<Button variant="default" size="sm" onClick={handleRestart}>
					Restart
				</Button>
			</div>
			<button
				type="button"
				onClick={handleDismiss}
				className="absolute -top-2 -left-2 size-5 flex items-center justify-center rounded-full bg-background border border-border text-muted-foreground hover:text-foreground transition-colors"
				aria-label="Dismiss"
			>
				<HiMiniXMark className="size-3" />
			</button>
		</div>
	);
}
