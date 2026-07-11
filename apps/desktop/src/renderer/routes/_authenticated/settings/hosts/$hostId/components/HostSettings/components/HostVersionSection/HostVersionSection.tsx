import { alert } from "@superset/ui/atoms/Alert";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpCircle, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	EXPECTED_HOST_SERVICE_VERSION,
	getHostVersionState,
	useHostInfo,
} from "renderer/hooks/host-service/useHostInfo";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	canOfferHostUpdate,
	getHostUpdateLifecycleDecision,
	type TerminalVerificationState,
} from "./host-version-lifecycle";

const UPDATE_POLL_INTERVAL_MS = 2_000;
const UPDATE_TIMEOUT_MS = 2 * 60_000;

interface HostVersionSectionProps {
	hostUrl: string | null;
	organizationId: string;
	machineId: string;
	isRemoteTarget: boolean;
	isOnline: boolean;
	canUpdate: boolean;
}

interface CompatibleHostInfo {
	version: string;
	supportsRemoteUpdate?: boolean;
}

function hostUpdateStatusQueryKey(organizationId: string, machineId: string) {
	return ["remoteHostUpdateStatus", organizationId, machineId] as const;
}

export function HostVersionSection({
	hostUrl,
	organizationId,
	machineId,
	isRemoteTarget,
	isOnline,
	canUpdate,
}: HostVersionSectionProps) {
	const queryClient = useQueryClient();
	const [awaitingTarget, setAwaitingTarget] = useState<string | null>(null);
	const [terminalVerification, setTerminalVerification] =
		useState<TerminalVerificationState>("not-needed");
	const mountedRef = useRef(true);
	const updateToastIdRef = useRef<string | number | null>(null);
	const verifiedTerminalResultRef = useRef<string | null>(null);
	const timedOutTargetRef = useRef<string | null>(null);
	const shouldPoll = awaitingTarget !== null;

	const infoQuery = useHostInfo(
		{ hostUrl, organizationId, machineId },
		{
			enabled: isRemoteTarget && (isOnline || shouldPoll),
			refetchInterval: shouldPoll ? UPDATE_POLL_INTERVAL_MS : false,
		},
	);

	const updateStatusQuery = useQuery({
		queryKey: hostUpdateStatusQueryKey(organizationId, machineId),
		enabled: Boolean(hostUrl && isRemoteTarget),
		queryFn: ({ signal }) => {
			if (!hostUrl) throw new Error("Host unavailable");
			return getHostServiceClientByUrl(hostUrl).host.update.status.query(
				undefined,
				{ signal },
			);
		},
		refetchInterval: shouldPoll ? UPDATE_POLL_INTERVAL_MS : false,
		refetchIntervalInBackground: shouldPoll,
		retry: false,
	});

	const requestUpdate = useMutation({
		mutationFn: () =>
			apiTrpcClient.host.update.mutate({
				organizationId,
				machineId,
				targetVersion: EXPECTED_HOST_SERVICE_VERSION,
			}),
		onMutate: () => {
			setAwaitingTarget(null);
			setTerminalVerification("not-needed");
			verifiedTerminalResultRef.current = null;
			timedOutTargetRef.current = null;
			queryClient.setQueryData(
				hostUpdateStatusQueryKey(organizationId, machineId),
				{ status: "idle" },
			);
			if (updateToastIdRef.current !== null) {
				toast.dismiss(updateToastIdRef.current);
			}
			updateToastIdRef.current = toast.loading("Sending host update...");
		},
		onSuccess: (result) => {
			if (!mountedRef.current) return;
			setAwaitingTarget(EXPECTED_HOST_SERVICE_VERSION);
			toast.loading(
				result.outcome === "satisfied"
					? "Verifying host version..."
					: "Updating host...",
				{
					id: updateToastIdRef.current ?? undefined,
					description: `Installing ${EXPECTED_HOST_SERVICE_VERSION}. The host may disconnect briefly.`,
				},
			);
			void infoQuery.refetch();
			void updateStatusQuery.refetch();
		},
		onError: (error) => {
			if (!mountedRef.current) return;
			setAwaitingTarget(null);
			toast.error("Failed to request host update", {
				id: updateToastIdRef.current ?? undefined,
				description: error.message,
			});
			updateToastIdRef.current = null;
			void updateStatusQuery.refetch();
		},
	});

	const hostInfo = infoQuery.data as CompatibleHostInfo | undefined;
	const runningVersion = hostInfo?.version ?? null;
	const versionState = runningVersion
		? getHostVersionState(runningVersion, EXPECTED_HOST_SERVICE_VERSION)
		: null;
	const supportsRemoteUpdate = hostInfo?.supportsRemoteUpdate ?? false;
	const updateStatus = updateStatusQuery.data;
	const hasFreshUpdateStatus =
		updateStatusQuery.isFetchedAfterMount && updateStatusQuery.isSuccess;
	const lifecycle = getHostUpdateLifecycleDecision({
		status: updateStatus,
		isFetchedAfterMount: hasFreshUpdateStatus,
		runningVersion,
		expectedVersion: EXPECTED_HOST_SERVICE_VERSION,
		now: Date.now(),
		recentCompletionWindowMs: UPDATE_TIMEOUT_MS,
	});
	const lifecycleResumableTarget =
		lifecycle.kind === "resume" ? lifecycle.targetVersion : null;
	const resumableTarget =
		lifecycleResumableTarget === timedOutTargetRef.current
			? null
			: lifecycleResumableTarget;
	const hasTimedOutActiveUpdate =
		lifecycleResumableTarget !== null &&
		lifecycleResumableTarget === timedOutTargetRef.current;
	const terminalVerificationKey =
		lifecycle.kind === "verify" ? lifecycle.resultKey : null;

	useEffect(() => {
		if (!resumableTarget || awaitingTarget === resumableTarget) return;

		if (updateToastIdRef.current === null) {
			updateToastIdRef.current = toast.loading("Updating host...", {
				description: `Waiting for ${resumableTarget} to finish installing.`,
			});
		}
		setAwaitingTarget(resumableTarget);
	}, [awaitingTarget, resumableTarget]);

	useEffect(() => {
		if (lifecycle.kind === "settled") timedOutTargetRef.current = null;
	}, [lifecycle.kind]);

	useEffect(() => {
		if (!terminalVerificationKey || awaitingTarget) {
			setTerminalVerification((current) =>
				current === "not-needed" ? current : "not-needed",
			);
			return;
		}
		if (verifiedTerminalResultRef.current === terminalVerificationKey) return;

		verifiedTerminalResultRef.current = terminalVerificationKey;
		setTerminalVerification("pending");
		let cancelled = false;
		void infoQuery.refetch().then((result) => {
			if (cancelled || !mountedRef.current) return;
			setTerminalVerification(result.isSuccess ? "complete" : "failed");
		});

		return () => {
			cancelled = true;
		};
	}, [awaitingTarget, infoQuery.refetch, terminalVerificationKey]);

	useEffect(() => {
		if (!awaitingTarget) return;

		if (runningVersion === awaitingTarget) {
			setAwaitingTarget(null);
			toast.success("Host updated", {
				id: updateToastIdRef.current ?? undefined,
				description: `Now running ${awaitingTarget}.`,
			});
			updateToastIdRef.current = null;
			return;
		}

		if (
			hasFreshUpdateStatus &&
			updateStatus?.status === "failed" &&
			updateStatus.targetVersion === awaitingTarget
		) {
			setAwaitingTarget(null);
			toast.error("Host update failed", {
				id: updateToastIdRef.current ?? undefined,
				description:
					updateStatus.error ?? "The host could not apply the update.",
			});
			updateToastIdRef.current = null;
		}
	}, [awaitingTarget, hasFreshUpdateStatus, runningVersion, updateStatus]);

	useEffect(() => {
		if (!awaitingTarget) return;

		const timeout = setTimeout(() => {
			if (!mountedRef.current) return;
			timedOutTargetRef.current = awaitingTarget;
			setAwaitingTarget(null);
			toast.error("Host update timed out", {
				id: updateToastIdRef.current ?? undefined,
				description:
					"The update was sent, but the host did not return with the expected version.",
			});
			updateToastIdRef.current = null;
		}, UPDATE_TIMEOUT_MS);

		return () => clearTimeout(timeout);
	}, [awaitingTarget]);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			if (updateToastIdRef.current !== null) {
				toast.dismiss(updateToastIdRef.current);
				updateToastIdRef.current = null;
			}
		};
	}, []);

	if (!isRemoteTarget) return null;

	const isUpdating =
		requestUpdate.isPending || shouldPoll || resumableTarget !== null;
	const showUpdateButton =
		versionState === "outdated" &&
		canUpdate &&
		isOnline &&
		supportsRemoteUpdate;
	const canRequestUpdate = canOfferHostUpdate({
		versionState,
		canUpdate,
		isOnline,
		supportsRemoteUpdate,
		isRequestPending: requestUpdate.isPending,
		isAwaitingTarget: shouldPoll,
		lifecycle,
		terminalVerification,
	});
	const isUpdateActionBusy =
		isUpdating ||
		terminalVerification === "pending" ||
		lifecycle.kind === "checking";
	const confirmUpdate = () => {
		alert({
			title: "Update this host?",
			description: `Update this host from ${runningVersion ?? "its current version"} to ${EXPECTED_HOST_SERVICE_VERSION}? The host will restart and briefly disconnect active clients.`,
			actions: [
				{ label: "Cancel", variant: "outline", onClick: () => {} },
				{
					label: "Update host",
					variant: "default",
					onClick: () => requestUpdate.mutate(),
				},
			],
		});
	};

	const statusLabel = (() => {
		if (isUpdating) {
			if (requestUpdate.isPending) return "Sending update request";
			if (updateStatus?.status === "succeeded") return "Restarting host";
			if (!infoQuery.isSuccess) return "Reconnecting";
			return "Installing update";
		}
		if (terminalVerification === "pending") return "Verifying host version";
		if (terminalVerification === "failed") {
			return "Version verification unavailable";
		}
		if (hasTimedOutActiveUpdate) return "Update status timed out";
		if (lifecycle.kind === "checking" && supportsRemoteUpdate) {
			return "Checking update status";
		}
		if (versionState === "match") return "Up to date";
		if (versionState === "outdated") return "Update available";
		if (versionState === "newer") return "Host is newer";
		if (versionState === "invalid") return "Unknown version";
		if (!isOnline) return "Host offline";
		if (infoQuery.isError) return "Version unavailable";
		return "Checking version";
	})();

	const supportCopy = (() => {
		if (isUpdating) {
			return "The host will reconnect automatically after the update is installed.";
		}
		if (terminalVerification === "pending") {
			return "Confirming the version currently running on the host.";
		}
		if (terminalVerification === "failed") {
			return "The previous update completed, but the host version could not be verified. Reconnect the host and try again.";
		}
		if (hasTimedOutActiveUpdate) {
			return "The host still reports an update in progress, but it did not finish within two minutes.";
		}
		if (!runningVersion) {
			return isOnline
				? "The host version could not be read."
				: "Reconnect this host to check its installed version.";
		}
		if (versionState === "match") {
			return "This host matches the version bundled with this client.";
		}
		if (versionState === "newer") {
			return "This host is newer than this client. Update this app to use the same host version.";
		}
		if (versionState === "invalid") {
			return "The host reported an unrecognized version. Update Superset directly on that device.";
		}
		if (!isOnline) return "Reconnect this host before requesting an update.";
		if (!supportsRemoteUpdate) {
			return `Remote updates are unavailable for this host. Update Superset directly on that device to ${EXPECTED_HOST_SERVICE_VERSION}.`;
		}
		if (!canUpdate) return "Only host owners can send remote updates.";
		if (lifecycle.kind === "checking") {
			return "Checking whether another host update is already in progress.";
		}
		return "Install the matching host version. The host may disconnect briefly while restarting.";
	})();

	return (
		<section className="space-y-3" aria-live="polite">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h3 className="text-sm font-medium">Host version</h3>
					<p className="mt-0.5 text-sm text-muted-foreground">
						Version of the Superset service running on this host.
					</p>
				</div>
				{showUpdateButton ? (
					<Button
						type="button"
						size="sm"
						onClick={confirmUpdate}
						disabled={!canRequestUpdate}
						className="shrink-0 gap-1.5"
					>
						{isUpdateActionBusy ? (
							<LoaderCircle
								className="size-3.5 animate-spin"
								aria-hidden="true"
							/>
						) : (
							<ArrowUpCircle className="size-3.5" aria-hidden="true" />
						)}
						{isUpdating
							? "Updating..."
							: terminalVerification === "pending"
								? "Verifying..."
								: lifecycle.kind === "checking"
									? "Checking..."
									: "Update host"}
					</Button>
				) : null}
			</div>

			<div className="w-full max-w-lg border-y border-border/60 text-sm">
				<div className="flex items-center justify-between gap-4 py-2.5">
					<span className="text-muted-foreground">Running</span>
					<code className="font-mono text-xs tabular-nums">
						{runningVersion ?? "Unknown"}
					</code>
				</div>
				<div className="flex items-center justify-between gap-4 border-t border-border/60 py-2.5">
					<span className="text-muted-foreground">Expected</span>
					<code className="font-mono text-xs tabular-nums">
						{EXPECTED_HOST_SERVICE_VERSION}
					</code>
				</div>
			</div>

			<div className="flex max-w-lg items-start gap-2 text-xs text-muted-foreground">
				<span
					aria-hidden="true"
					className={cn(
						"mt-1 size-1.5 shrink-0 rounded-full",
						versionState === "match" && "bg-emerald-500",
						versionState === "outdated" && "bg-amber-500",
						versionState === "invalid" && "bg-destructive",
						(versionState === "newer" || versionState === null) &&
							"bg-muted-foreground/60",
					)}
				/>
				<p>
					<span className="font-medium text-foreground">{statusLabel}.</span>{" "}
					{supportCopy}
				</p>
			</div>
		</section>
	);
}
