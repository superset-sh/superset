import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { trpc } from "renderer/lib/trpc";
import { AUTO_UPDATE_STATUS } from "shared/auto-update";

const RELEASES_URL = "https://github.com/superset-sh/superset/releases";

interface UpdateToastProps {
	toastId: string | number;
	status: "downloading" | "ready";
	version?: string;
}

export function UpdateToast({ toastId, status, version }: UpdateToastProps) {
	const openUrl = trpc.external.openUrl.useMutation();
	const installMutation = trpc.autoUpdate.install.useMutation();
	const dismissMutation = trpc.autoUpdate.dismiss.useMutation({
		onSuccess: () => {
			toast.dismiss(toastId);
		},
	});

	const isDownloading = status === AUTO_UPDATE_STATUS.DOWNLOADING;
	const isReady = status === AUTO_UPDATE_STATUS.READY;

	const handleSeeChanges = () => {
		openUrl.mutate(RELEASES_URL);
	};

	const handleInstall = () => {
		installMutation.mutate();
	};

	const handleLater = () => {
		dismissMutation.mutate();
	};

	return (
		<div className="relative flex flex-col gap-3 bg-popover text-popover-foreground rounded-lg border border-border p-4 shadow-lg min-w-[340px]">
			<div className="flex flex-col gap-0.5">
				{isDownloading ? (
					<>
						<span className="font-medium text-sm">Downloading update...</span>
						<span className="text-sm text-muted-foreground">
							{version ? `Version ${version}` : "Please wait"}
						</span>
					</>
				) : (
					<>
						<span className="font-medium text-sm">Update available</span>
						<span className="text-sm text-muted-foreground">
							{version ? `Version ${version} is ready to install` : "Ready to install"}
						</span>
					</>
				)}
			</div>
			{isReady && (
				<div className="flex items-center gap-2">
					<Button variant="ghost" size="sm" onClick={handleSeeChanges}>
						See changes
					</Button>
					<Button variant="ghost" size="sm" onClick={handleLater}>
						Later
					</Button>
					<Button size="sm" onClick={handleInstall} disabled={installMutation.isPending}>
						{installMutation.isPending ? "Installing..." : "Install"}
					</Button>
				</div>
			)}
		</div>
	);
}
