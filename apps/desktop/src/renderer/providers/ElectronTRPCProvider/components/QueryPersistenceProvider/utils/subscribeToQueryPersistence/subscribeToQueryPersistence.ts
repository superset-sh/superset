import {
	type PersistedQueryClientSaveOptions,
	persistQueryClientSave,
} from "@tanstack/react-query-persist-client";

export function subscribeToQueryPersistence(
	options: PersistedQueryClientSaveOptions,
	saveIntervalMs = 30_000,
) {
	let dirty = false;
	let stopped = false;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let pendingSave: Promise<void> | undefined;

	const clearTimer = () => {
		clearTimeout(timer);
		timer = undefined;
	};

	const scheduleSave = () => {
		if (!stopped && timer === undefined) {
			timer = setTimeout(() => void flush(), saveIntervalMs);
		}
	};

	const flush = (): Promise<void> => {
		clearTimer();
		if (pendingSave) return pendingSave.then(flush);
		if (!dirty) return Promise.resolve();
		dirty = false;
		pendingSave = persistQueryClientSave(options)
			.catch((error) => {
				dirty = true;
				scheduleSave();
				console.warn("[query-persistence] Failed to save cache", error);
			})
			.finally(() => {
				pendingSave = undefined;
			});
		return pendingSave;
	};

	const onCacheChange = ({ type }: { type: string }) => {
		if (type !== "added" && type !== "updated" && type !== "removed") return;
		dirty = true;
		scheduleSave();
	};

	const onLeave = () => void flush();
	const onVisibilityChange = () => {
		if (document.visibilityState === "hidden") onLeave();
	};
	const unsubscribeQuery = options.queryClient
		.getQueryCache()
		.subscribe(onCacheChange);
	const unsubscribeMutation = options.queryClient
		.getMutationCache()
		.subscribe(onCacheChange);
	window.addEventListener("blur", onLeave);
	window.addEventListener("pagehide", onLeave);
	document.addEventListener("visibilitychange", onVisibilityChange);

	return () => {
		stopped = true;
		unsubscribeQuery();
		unsubscribeMutation();
		window.removeEventListener("blur", onLeave);
		window.removeEventListener("pagehide", onLeave);
		document.removeEventListener("visibilitychange", onVisibilityChange);
		void flush();
	};
}
