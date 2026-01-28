import { COMPANY } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import { useState } from "react";
import { HiArrowPath, HiExclamationTriangle } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { AppFrame } from "renderer/screens/main/components/AppFrame";
import { Background } from "renderer/screens/main/components/Background";
import { AUTO_UPDATE_STATUS, type AutoUpdateStatus } from "shared/auto-update";

interface UpdateRequiredPageProps {
	currentVersion: string;
	minimumVersion: string;
	message?: string;
}

export function UpdateRequiredPage({
	currentVersion,
	minimumVersion,
	message,
}: UpdateRequiredPageProps) {
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const checkMutation = electronTrpc.autoUpdate.check.useMutation();
	const installMutation = electronTrpc.autoUpdate.install.useMutation();

	// Track update status via subscription for real-time updates
	const [updateStatus, setUpdateStatus] = useState<{
		status: AutoUpdateStatus;
		error?: string;
	}>({ status: AUTO_UPDATE_STATUS.IDLE });

	// Subscribe to auto-update status changes
	electronTrpc.autoUpdate.subscribe.useSubscription(undefined, {
		onData: (event) => {
			setUpdateStatus({ status: event.status, error: event.error });
		},
	});

	const isChecking = updateStatus.status === AUTO_UPDATE_STATUS.CHECKING;
	const isDownloading = updateStatus.status === AUTO_UPDATE_STATUS.DOWNLOADING;
	const isReady = updateStatus.status === AUTO_UPDATE_STATUS.READY;
	const isError = updateStatus.status === AUTO_UPDATE_STATUS.ERROR;
	const isLoading = isChecking || isDownloading;

	const handleCheckForUpdate = () => {
		checkMutation.mutate();
	};

	const handleInstall = () => {
		installMutation.mutate();
	};

	const handleDownloadManually = () => {
		openUrl.mutate(COMPANY.CHANGELOG_URL);
	};

	return (
		<>
			<Background />
			<AppFrame>
				<div className="flex h-full w-full flex-col items-center justify-center gap-6 bg-background p-8">
					<div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
						<HiExclamationTriangle className="h-8 w-8 text-amber-500" />
					</div>

					<div className="flex flex-col items-center gap-2 text-center">
						<h1 className="text-xl font-semibold">Update Required</h1>
						<p className="max-w-md text-muted-foreground">
							{message ||
								"A new version of Superset is required to continue. Please update to the latest version."}
						</p>
					</div>

					<div className="flex flex-col items-center gap-1 text-sm text-muted-foreground">
						<span>Your version: {currentVersion}</span>
						<span>Required version: {minimumVersion}+</span>
					</div>

					{isError && (
						<p className="text-sm text-destructive">
							{updateStatus.error || "Update check failed. Please try again."}
						</p>
					)}

					<div className="flex items-center gap-3">
						{isReady ? (
							<Button
								onClick={handleInstall}
								disabled={installMutation.isPending}
							>
								{installMutation.isPending
									? "Installing..."
									: "Install & Restart"}
							</Button>
						) : (
							<Button
								onClick={handleCheckForUpdate}
								disabled={isLoading || checkMutation.isPending}
								className="gap-2"
							>
								<HiArrowPath
									className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
								/>
								{isChecking
									? "Checking..."
									: isDownloading
										? "Downloading..."
										: "Check for Update"}
							</Button>
						)}

						<Button variant="ghost" onClick={handleDownloadManually}>
							Download Manually
						</Button>
					</div>
				</div>
			</AppFrame>
		</>
	);
}
