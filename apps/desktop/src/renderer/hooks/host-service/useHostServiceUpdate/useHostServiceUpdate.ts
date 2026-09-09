import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { errorMessage } from "@superset/i18n/errors";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import {
	getHostServiceClientByUrl,
	isHostServiceConnectionError,
} from "renderer/lib/host-service-client";
import { hostServiceInfoQueryKey } from "../useHostServiceInfo";
import { readHostUpdateSnapshot } from "./useHostServiceUpdate.utils";

export type HostUpdateStage =
	| "idle"
	| "downloading"
	| "restarting"
	| "reconnecting"
	| "updated"
	| "failed";

export interface HostUpdateProgress {
	stage: HostUpdateStage;
	target: string | null;
	error: string | null;
	startedAt: number | null;
}

const IDLE: HostUpdateProgress = {
	stage: "idle",
	target: null,
	error: null,
	startedAt: null,
};

const POLL_INTERVAL_MS = 1_500;
const OVERALL_TIMEOUT_MS = 15 * 60_000;

/**
 * Drive `system.update` on a host-service and follow it through the
 * restart. The mutation returns as soon as the download starts; progress is
 * read from `system.updateStatus` until the process goes away, then the
 * hook keeps asking `health.check` until the new version answers or the
 * marker the old process left says it rolled back.
 */
export function useHostServiceUpdate(options: {
	hostUrl: string | null;
	targetVersion: string;
}) {
	const { hostUrl, targetVersion } = options;
	const [progress, setProgress] = useState<HostUpdateProgress>(IDLE);
	const runRef = useRef(0);
	const queryClient = useQueryClient();
	const cloudUtils = cloudTrpc.useUtils();

	// biome-ignore lint/correctness/useExhaustiveDependencies: a different host or target starts a new update scope.
	useEffect(() => {
		setProgress(IDLE);
		return () => {
			runRef.current += 1;
		};
	}, [hostUrl, targetVersion]);

	const start = useCallback(async () => {
		if (!hostUrl) return;
		const run = ++runRef.current;
		const active = () => runRef.current === run;
		const startedAt = Date.now();
		const update = (patch: Partial<HostUpdateProgress>) => {
			if (active())
				setProgress((prev) => ({ ...prev, target: targetVersion, ...patch }));
		};
		const finishUpdated = () => {
			void queryClient.invalidateQueries({
				queryKey: hostServiceInfoQueryKey(hostUrl),
			});
			void cloudUtils.v2Host.list.invalidate();
			update({ stage: "updated", error: null });
		};
		const fail = (error: string) => update({ stage: "failed", error });

		setProgress({
			stage: "downloading",
			target: targetVersion,
			error: null,
			startedAt,
		});
		const client = getHostServiceClientByUrl(hostUrl);
		try {
			await client.system.update.mutate(
				{ version: targetVersion },
				{ signal: AbortSignal.timeout(15_000) },
			);
		} catch (error) {
			fail(
				isHostServiceConnectionError(error)
					? i18n._(
							msg({
								message:
									"Could not reach the host to start the update. Check that it is online and try again.",
							}),
						)
					: errorMessage(error),
			);
			return;
		}

		let sawRestart = false;
		while (active() && Date.now() - startedAt < OVERALL_TIMEOUT_MS) {
			await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
			if (!active()) return;
			try {
				const { health: info, status } = await readHostUpdateSnapshot(
					client,
					targetVersion,
				);
				if (!status) {
					finishUpdated();
					return;
				}
				if (status.phase === "failed") {
					fail(
						status.error ??
							i18n._(msg({ message: "The host reported a failed update." })),
					);
					return;
				}
				if (status.phase === "downloading") {
					update({ stage: "downloading" });
					continue;
				}
				if (status.phase === "restarting") {
					update({ stage: "restarting" });
					continue;
				}
				const last = status.lastResult;
				if (
					last &&
					last.at >= startedAt - 1_000 &&
					last.outcome !== "updated"
				) {
					fail(
						last.error ??
							i18n._(
								msg({ message: "The host went back to its previous build." }),
							),
					);
					return;
				}
				if (sawRestart) {
					fail(
						i18n._(
							msg({
								message: `The host came back on ${info.version}, not ${targetVersion}.`,
							}),
						),
					);
					return;
				}
			} catch (error) {
				if (isHostServiceConnectionError(error)) {
					sawRestart = true;
					update({ stage: "reconnecting" });
					continue;
				}
				fail(errorMessage(error));
				return;
			}
		}
		if (active()) {
			fail(
				i18n._(
					msg({
						message: "The host did not come back within fifteen minutes.",
					}),
				),
			);
		}
	}, [hostUrl, targetVersion, queryClient, cloudUtils]);

	const reset = useCallback(() => {
		runRef.current += 1;
		setProgress(IDLE);
	}, []);

	return { progress, start, reset };
}
