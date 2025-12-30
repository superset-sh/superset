import { Button } from "@superset/ui/button";
import { useState } from "react";
import { trpc } from "renderer/lib/trpc";
import {
	AUTO_UPDATE_STATUS,
	type AutoUpdateStatus,
	RELEASES_URL,
} from "shared/auto-update";
import type { VersionGateStatus } from "shared/types";
import { AppFrame } from "../main/components/AppFrame";
import { Background } from "../main/components/Background";

interface UpdateRequiredScreenProps {
	status: VersionGateStatus;
}

interface AutoUpdateStatusEvent {
	status: AutoUpdateStatus;
	version?: string;
	error?: string;
}

export function UpdateRequiredScreen({ status }: UpdateRequiredScreenProps) {
	const openUrl = trpc.external.openUrl.useMutation();
	const checkMutation = trpc.autoUpdate.check.useMutation();
	const installMutation = trpc.autoUpdate.install.useMutation();
	const [update, setUpdate] = useState<AutoUpdateStatusEvent>({
		status: AUTO_UPDATE_STATUS.IDLE,
	});

	trpc.autoUpdate.subscribe.useSubscription(undefined, {
		onData: (event) => setUpdate(event),
	});

	const isChecking = update.status === AUTO_UPDATE_STATUS.CHECKING;
	const isDownloading = update.status === AUTO_UPDATE_STATUS.DOWNLOADING;
	const isReady = update.status === AUTO_UPDATE_STATUS.READY;
	const isError = update.status === AUTO_UPDATE_STATUS.ERROR;

	const canAutoUpdate = status.autoUpdateSupported;

	const buttonLabel = isReady
		? "Install update"
		: canAutoUpdate
			? isChecking || isDownloading
				? "Updating..."
				: "Update now"
			: "Open download page";

	const isButtonDisabled =
		installMutation.isPending ||
		checkMutation.isPending ||
		isChecking ||
		isDownloading;

	const handleUpdate = () => {
		if (isReady) {
			installMutation.mutate();
			return;
		}

		if (canAutoUpdate) {
			checkMutation.mutate();
			return;
		}

		openUrl.mutate(RELEASES_URL);
	};

	return (
		<>
			<Background />
			<AppFrame>
				<div className="flex h-full w-full items-center justify-center bg-background p-6">
					<div className="flex w-full max-w-md flex-col gap-4 text-center">
						<div className="flex flex-col gap-2">
							<h1 className="text-lg font-medium">Update required</h1>
							<p className="text-sm text-muted-foreground">
								Your version of Superset is no longer supported.
							</p>
						</div>

						<div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
							<div>
								Current:{" "}
								<span className="font-medium">{status.currentVersion}</span>
							</div>
							{status.minimumSupportedVersion && (
								<div>
									Minimum:{" "}
									<span className="font-medium">
										{status.minimumSupportedVersion}
									</span>
								</div>
							)}
						</div>

						<div className="flex flex-col gap-2">
							{isError ? (
								<p className="text-sm text-destructive">
									Update check failed{update.error ? `: ${update.error}` : ""}
								</p>
							) : isDownloading ? (
								<p className="text-sm text-muted-foreground">
									Downloading update
									{update.version ? ` (${update.version})` : ""}...
								</p>
							) : isReady ? (
								<p className="text-sm text-muted-foreground">
									Update is ready to install.
								</p>
							) : canAutoUpdate ? (
								<p className="text-sm text-muted-foreground">
									Click update to download and install the latest version.
								</p>
							) : (
								<p className="text-sm text-muted-foreground">
									Please download and install the latest version.
								</p>
							)}

							<Button onClick={handleUpdate} disabled={isButtonDisabled}>
								{buttonLabel}
							</Button>
						</div>
					</div>
				</div>
			</AppFrame>
		</>
	);
}
