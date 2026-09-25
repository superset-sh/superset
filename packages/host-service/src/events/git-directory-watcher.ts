import { Worker } from "node:worker_threads";
import { resolveHostWorkerScriptPath } from "../workers/host-worker-pool.ts";

export class GitDirectoryWatcher {
	private worker: Worker | null = null;
	private nextId = 0;
	private readonly subscriptions = new Map<
		number,
		{
			onChange: (filename: string | null) => void;
			onError: () => void;
		}
	>();

	constructor(private readonly resolveScript = resolveHostWorkerScriptPath) {}

	watch(
		path: string,
		onChange: (filename: string | null) => void,
		onError: () => void,
	): { close: () => void } {
		if (!this.worker) {
			const script = this.resolveScript();
			if (!script)
				throw new Error("Git directory watches require the host worker bundle");
			const worker = new Worker(script, {
				workerData: { role: "git-directory-watcher" },
			});
			this.worker = worker;
			worker.on(
				"message",
				(message: {
					type: "change" | "error";
					id: number;
					filename: string | null;
				}) => {
					if (this.worker !== worker) return;
					const subscription = this.subscriptions.get(message.id);
					if (message.type === "error") subscription?.onError();
					else subscription?.onChange(message.filename);
				},
			);
			const fail = () => {
				if (this.worker !== worker) return;
				this.worker = null;
				const subscriptions = [...this.subscriptions.values()];
				this.subscriptions.clear();
				for (const subscription of subscriptions) subscription.onError();
			};
			worker.on("error", fail);
			worker.on("exit", fail);
		}
		const id = ++this.nextId;
		this.subscriptions.set(id, { onChange, onError });
		this.worker.postMessage({ type: "watch", id, path });
		return {
			close: () => {
				if (!this.subscriptions.delete(id)) return;
				this.worker?.postMessage({ type: "unwatch", id });
				if (this.subscriptions.size === 0) this.close();
			},
		};
	}

	close(): void {
		const worker = this.worker;
		this.worker = null;
		this.subscriptions.clear();
		if (worker) void worker.terminate();
	}
}
