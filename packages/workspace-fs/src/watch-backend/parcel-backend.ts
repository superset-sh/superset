import { watch as probeNativeWatch } from "node:fs";
import type { NativeWatchBackend } from "./types";

// Linux: @parcel/watcher's inotify backend starts on a thread and the caller
// blocks until that thread signals it started. When inotify_init fails
// (EMFILE at fs.inotify.max_user_instances, 128 by default and shared by
// every process of the user) the thread throws before signalling and the
// calling thread — host-service's event loop — waits forever. A throwaway
// fs.watch makes the same inotify_init call and fails cleanly instead.
function assertNativeWatchAvailable(dir: string): void {
	if (process.platform !== "linux") return;
	let probe: ReturnType<typeof probeNativeWatch>;
	try {
		probe = probeNativeWatch(dir, { persistent: false });
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code ?? "unknown";
		throw new Error(
			`Cannot watch path: inotify unavailable (${code}); raise fs.inotify.max_user_instances or close other watchers: ${dir}`,
		);
	}
	probe.close();
}

export const parcelWatchBackend: NativeWatchBackend = {
	name: "parcel",
	async subscribe({ rootPath, ignore, generation, onEvents, onError }) {
		assertNativeWatchAvailable(rootPath);
		// parcel dedupes native backends by (dir, ignore-set); a wedged backend
		// from a dead stream (its unsubscribe can hang) would be silently
		// joined and never deliver. The pattern matches nothing real — it only
		// forces a distinct backend identity per re-attach.
		const uniqueIgnore =
			generation === 1
				? ignore
				: [...ignore, `**/.superset-watch-generation-${generation}/**`];
		// Loaded on first use so a platform on another backend never maps the
		// native addon into the process.
		const { subscribe: subscribeToFilesystem } = await import(
			"@parcel/watcher"
		);
		const subscription = await subscribeToFilesystem(
			rootPath,
			(error, events) => {
				// Log the error, then process whatever events arrived alongside
				// it. Mirrors VS Code's parcelWatcher.ts:373-378.
				if (error) onError(error);
				if (events.length > 0) onEvents(events);
			},
			{ ignore: uniqueIgnore },
		);
		return { unsubscribe: () => subscription.unsubscribe() };
	},
};
