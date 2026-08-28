import { useCallback, useEffect, useRef } from "react";
import { buildPayload, publishPayload } from "renderer/lib/leaderboard";
import { useLeaderboardOptIn } from "renderer/routes/_authenticated/hooks/useLeaderboardOptIn";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	CHECK_INTERVAL_MS,
	hashPayload,
	isPublishDue,
	publishWindowDays,
} from "./autoPublishSchedule";
import {
	readAutoPublishState,
	writeAutoPublishState,
} from "./autoPublishState";

export function useLeaderboardAutoPublish(): void {
	const { activeHostUrl, machineId } = useLocalHostService();
	const { handle } = useLeaderboardOptIn();
	const inFlight = useRef(false);

	const maybePublish = useCallback(async () => {
		if (!handle || !activeHostUrl || !machineId) return;
		if (inFlight.current) return;

		const state = readAutoPublishState(handle);
		const now = Date.now();
		if (!isPublishDue(state, now)) return;

		inFlight.current = true;
		try {
			const payload = await buildPayload(
				activeHostUrl,
				publishWindowDays(state, now),
			);
			const hash = hashPayload(payload);
			if (hash !== state.lastPayloadHash) {
				await publishPayload(machineId, payload);
			}
			writeAutoPublishState({
				handle,
				lastPublishedAt: Date.now(),
				lastPayloadHash: hash,
			});
		} catch (error) {
			console.warn("[leaderboard] auto-publish failed (will retry):", error);
		} finally {
			inFlight.current = false;
		}
	}, [handle, activeHostUrl, machineId]);

	useEffect(() => {
		if (!handle || !activeHostUrl || !machineId) return;

		void maybePublish();
		const timer = setInterval(() => void maybePublish(), CHECK_INTERVAL_MS);
		const onVisibility = () => {
			if (!document.hidden) void maybePublish();
		};
		document.addEventListener("visibilitychange", onVisibility);
		window.addEventListener("focus", onVisibility);

		return () => {
			clearInterval(timer);
			document.removeEventListener("visibilitychange", onVisibility);
			window.removeEventListener("focus", onVisibility);
		};
	}, [handle, activeHostUrl, machineId, maybePublish]);
}
