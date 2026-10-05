import { type FSWatcher, watch } from "node:fs";
import type { MessagePort } from "node:worker_threads";

export function startGitDirectoryWorker(port: MessagePort): void {
	const watchers = new Map<number, FSWatcher>();
	port.on(
		"message",
		(message: { type: "watch" | "unwatch"; id: number; path: string }) => {
			if (message.type === "unwatch") {
				watchers.get(message.id)?.close();
				watchers.delete(message.id);
				return;
			}
			try {
				const watcher = watch(
					message.path,
					{ recursive: true },
					(_event, filename) => {
						port.postMessage({ type: "change", id: message.id, filename });
					},
				);
				watchers.set(message.id, watcher);
				watcher.on("error", () => {
					watcher.close();
					watchers.delete(message.id);
					port.postMessage({ type: "error", id: message.id });
				});
				port.postMessage({ type: "change", id: message.id, filename: null });
			} catch {
				port.postMessage({ type: "error", id: message.id });
			}
		},
	);
}
