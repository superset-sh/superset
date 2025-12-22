import { Button } from "@superset/ui/button";
import { useEffect, useRef } from "react";
import { LuGift } from "react-icons/lu";
import { trpc } from "renderer/lib/trpc";
import { AUTO_UPDATE_STATUS } from "shared/constants";

export function UpdateToast() {
	const utils = trpc.useUtils();
	const { data: status } = trpc.autoUpdate.getStatus.useQuery();
	const installMutation = trpc.autoUpdate.installAndRestart.useMutation();
	const dismissMutation = trpc.autoUpdate.dismiss.useMutation({
		onSuccess: () => {
			utils.autoUpdate.getStatus.invalidate();
		},
	});
	const simulateMutation = trpc.autoUpdate.simulateUpdateReady.useMutation({
		onSuccess: () => {
			utils.autoUpdate.getStatus.invalidate();
		},
	});

	// Store mutation in ref to avoid effect re-running
	const simulateMutationRef = useRef(simulateMutation);
	simulateMutationRef.current = simulateMutation;

	// Subscribe to status changes
	trpc.autoUpdate.subscribe.useSubscription(undefined, {
		onData: () => {
			utils.autoUpdate.getStatus.invalidate();
		},
	});

	// DEV ONLY: Expose test helper on window
	useEffect(() => {
		if (process.env.NODE_ENV !== "development") return;

		const windowWithHelper = window as unknown as {
			__testUpdateToast?: () => void;
		};
		windowWithHelper.__testUpdateToast = () => {
			simulateMutationRef.current.mutate();
		};

		return () => {
			delete windowWithHelper.__testUpdateToast;
		};
	}, []);

	const isDownloading = status?.status === AUTO_UPDATE_STATUS.DOWNLOADING;
	const isReady = status?.status === AUTO_UPDATE_STATUS.READY;

	// Only show when downloading or ready
	if (!status || (!isDownloading && !isReady)) {
		return null;
	}

	const handleInstall = () => {
		installMutation.mutate();
	};

	const handleLater = () => {
		dismissMutation.mutate();
	};

	return (
		<div className="fixed bottom-6 left-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
			<div className="flex items-center gap-3 rounded-lg border border-border bg-popover px-4 py-2.5 shadow-lg">
				<LuGift className="h-5 w-5 text-muted-foreground shrink-0" />
				<span className="text-sm text-foreground">
					{isDownloading
						? `Update available! Downloading${status.version ? ` v${status.version}` : ""}...`
						: "New update available"}
				</span>
				{isReady && (
					<div className="flex items-center gap-1.5 ml-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={handleLater}
							className="text-muted-foreground hover:text-foreground h-7 px-2"
						>
							Later
						</Button>
						<Button
							size="sm"
							onClick={handleInstall}
							disabled={installMutation.isPending}
							className="h-7 px-3 bg-primary text-primary-foreground hover:bg-primary/80 active:scale-[0.98] transition-all"
						>
							{installMutation.isPending ? "Restarting..." : "Install"}
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
