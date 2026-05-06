import { alert } from "@superset/ui/atoms/Alert";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { Skeleton } from "@superset/ui/skeleton";
import { toast } from "@superset/ui/sonner";
import { useCallback, useEffect, useRef, useState } from "react";
import { HiArrowPath } from "react-icons/hi2";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

const SEMVER_RE = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.]+)?$/;
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 90_000;

interface HostInfo {
	binaryVersion: string;
	supportsRemoteUpdate: boolean;
}

interface UpdateHostSectionProps {
	organizationId: string;
	machineId: string;
	isOnline: boolean;
	isOwner: boolean;
}

type Status =
	| { kind: "idle" }
	| { kind: "updating"; targetVersion: string | null }
	| { kind: "succeeded"; previousVersion: string | null; newVersion: string }
	| { kind: "timed_out"; previousVersion: string | null }
	| { kind: "failed"; message: string };

export function UpdateHostSection({
	organizationId,
	machineId,
	isOnline,
	isOwner,
}: UpdateHostSectionProps) {
	const [info, setInfo] = useState<HostInfo | null>(null);
	const [infoLoading, setInfoLoading] = useState(true);
	const [infoError, setInfoError] = useState<string | null>(null);
	const [status, setStatus] = useState<Status>({ kind: "idle" });
	const [showVersionPicker, setShowVersionPicker] = useState(false);
	const [pinnedVersion, setPinnedVersion] = useState("");
	const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const fetchInfo = useCallback(async () => {
		setInfoError(null);
		try {
			const result = await apiTrpcClient.host.info.query({
				organizationId,
				machineId,
			});
			setInfo({
				binaryVersion: result.binaryVersion,
				supportsRemoteUpdate: result.supportsRemoteUpdate,
			});
			return result;
		} catch (err) {
			const message = err instanceof Error ? err.message : "unknown error";
			setInfoError(message);
			return null;
		}
	}, [organizationId, machineId]);

	useEffect(() => {
		setInfoLoading(true);
		setInfo(null);
		setStatus({ kind: "idle" });
		if (isOnline) {
			void fetchInfo().finally(() => setInfoLoading(false));
		} else {
			setInfoLoading(false);
		}
		return () => {
			if (refetchTimer.current) clearTimeout(refetchTimer.current);
		};
	}, [fetchInfo, isOnline]);

	if (!isOwner) return null;

	const startUpdate = async (targetVersion: string | null) => {
		setStatus({ kind: "updating", targetVersion });
		const previousVersion = info?.binaryVersion ?? null;

		let dispatchOutcome: "dispatched" | "satisfied" | "updated" | "failed";
		try {
			const result = await apiTrpcClient.host.update.mutate({
				organizationId,
				machineId,
				targetVersion: targetVersion ?? undefined,
			});
			dispatchOutcome = result.outcome;

			if (result.outcome === "satisfied") {
				setStatus({
					kind: "succeeded",
					previousVersion,
					newVersion: result.previousVersion ?? previousVersion ?? "current",
				});
				toast.success(`Already on ${result.previousVersion ?? "latest"}.`);
				return;
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "unknown error";
			setStatus({ kind: "failed", message });
			toast.error(`Update failed: ${message}`);
			return;
		}

		// Daemon SIGTERM'd itself; supervisor is doing the work. Poll host.info
		// until it returns again with a (presumably) different binaryVersion.
		const startedAt = Date.now();
		const poll = async () => {
			if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
				setStatus({ kind: "timed_out", previousVersion });
				toast.error(
					"Host did not come back online. Check ~/.superset/host/<orgId>/update.log on the host.",
				);
				return;
			}
			try {
				const result = await apiTrpcClient.host.info.query({
					organizationId,
					machineId,
				});
				setInfo({
					binaryVersion: result.binaryVersion,
					supportsRemoteUpdate: result.supportsRemoteUpdate,
				});
				const flipped =
					previousVersion === null ||
					result.binaryVersion !== previousVersion ||
					(targetVersion && result.binaryVersion === targetVersion);
				if (flipped || dispatchOutcome === "satisfied") {
					setStatus({
						kind: "succeeded",
						previousVersion,
						newVersion: result.binaryVersion,
					});
					toast.success(
						previousVersion && previousVersion !== result.binaryVersion
							? `Updated ${previousVersion} → ${result.binaryVersion}.`
							: `Host back online on ${result.binaryVersion}.`,
					);
					return;
				}
			} catch {
				// Host is mid-respawn; keep polling.
			}
			refetchTimer.current = setTimeout(poll, POLL_INTERVAL_MS);
		};
		refetchTimer.current = setTimeout(poll, POLL_INTERVAL_MS);
	};

	const confirmUpdate = (targetVersion: string | null) => {
		const versionLabel = targetVersion
			? `version ${targetVersion}`
			: "the latest version";
		alert({
			title: "Update host",
			description: `This restarts the daemon and installs ${versionLabel}. The host will be unavailable for about 30 seconds.`,
			actions: [
				{ label: "Cancel", variant: "outline", onClick: () => {} },
				{
					label: "Update",
					variant: "default",
					onClick: () => {
						void startUpdate(targetVersion);
					},
				},
			],
		});
	};

	const handlePinnedSubmit = () => {
		const trimmed = pinnedVersion.trim().replace(/^cli-v/, "");
		if (!SEMVER_RE.test(trimmed)) {
			toast.error("Invalid version. Expected semver like 0.2.7.");
			return;
		}
		setShowVersionPicker(false);
		setPinnedVersion("");
		confirmUpdate(trimmed);
	};

	const isUpdating = status.kind === "updating";

	return (
		<section className="space-y-3 mb-8">
			<div>
				<h3 className="text-sm font-medium">Software</h3>
				<p className="text-sm text-muted-foreground mt-0.5">
					Update the Superset daemon running on this host.
				</p>
			</div>

			<div className="rounded-md border border-border p-4">
				{infoLoading ? (
					<Skeleton className="h-5 w-32" />
				) : !isOnline ? (
					<p className="text-sm text-muted-foreground">
						Host is offline. Updates can only be triggered while the host is
						online.
					</p>
				) : infoError ? (
					<p className="text-sm text-muted-foreground">
						Couldn't reach this host: {infoError}
					</p>
				) : info && !info.supportsRemoteUpdate ? (
					<p className="text-sm text-muted-foreground">
						Remote update isn't supported for this host. It may be bundled with
						the desktop app, which updates itself automatically.
					</p>
				) : info ? (
					<div className="flex items-center justify-between gap-4">
						<div className="text-sm">
							<div>
								Current version{" "}
								<span className="font-mono">{info.binaryVersion}</span>
							</div>
							{status.kind === "succeeded" &&
								status.previousVersion &&
								status.previousVersion !== status.newVersion && (
									<div className="text-xs text-muted-foreground mt-0.5">
										Updated from {status.previousVersion}.
									</div>
								)}
							{status.kind === "timed_out" && (
								<div className="text-xs text-muted-foreground mt-0.5">
									Host hasn't come back online yet. It may still be installing.
								</div>
							)}
							{status.kind === "failed" && (
								<div className="text-xs text-destructive mt-0.5">
									{status.message}
								</div>
							)}
						</div>
						<div className="flex items-center gap-2 shrink-0">
							<Button
								variant="outline"
								size="sm"
								onClick={() => setShowVersionPicker((v) => !v)}
								disabled={isUpdating}
							>
								Pin version…
							</Button>
							<Button
								size="sm"
								onClick={() => confirmUpdate(null)}
								disabled={isUpdating}
								className="gap-2"
							>
								<HiArrowPath
									className={isUpdating ? "h-4 w-4 animate-spin" : "h-4 w-4"}
								/>
								{isUpdating ? "Updating…" : "Update host"}
							</Button>
						</div>
					</div>
				) : null}

				{showVersionPicker && info?.supportsRemoteUpdate && (
					<div className="mt-4 pt-4 border-t border-border space-y-2">
						<Label htmlFor="pinned-version">Specific version</Label>
						<div className="flex gap-2">
							<Input
								id="pinned-version"
								placeholder="0.2.7"
								value={pinnedVersion}
								onChange={(e) => setPinnedVersion(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") handlePinnedSubmit();
								}}
								disabled={isUpdating}
								className="font-mono"
							/>
							<Button
								size="sm"
								onClick={handlePinnedSubmit}
								disabled={isUpdating || !pinnedVersion.trim()}
							>
								Install
							</Button>
						</div>
						<p className="text-xs text-muted-foreground">
							Subject to your organization's minimum-allowed version policy.
						</p>
					</div>
				)}
			</div>
		</section>
	);
}
