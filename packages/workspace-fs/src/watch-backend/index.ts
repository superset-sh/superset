import { chokidarWatchBackend } from "./chokidar-backend";
import { parcelWatchBackend } from "./parcel-backend";
import type { NativeWatchBackend } from "./types";

export { chokidarWatchBackend } from "./chokidar-backend";
export { createIgnoreMatcher } from "./ignore-matcher";
export { parcelWatchBackend } from "./parcel-backend";
export type {
	NativeWatchBackend,
	NativeWatchEvent,
	NativeWatchRequest,
	NativeWatchSubscription,
} from "./types";

/**
 * @parcel/watcher's inotify backend takes the whole process down: a signal
 * landing on its thread makes `poll()` fail with EINTR, and its error path
 * destroys the backend from inside that thread (deadlock or SIGSEGV in
 * `InotifyBackend::~InotifyBackend`). Its FSEvents backend has no such loop.
 */
export function defaultWatchBackend(): NativeWatchBackend {
	return process.platform === "linux"
		? chokidarWatchBackend
		: parcelWatchBackend;
}
