import type { FileTree } from "@pierre/trees";
import { lookupDirectory } from "../../../../utils/treePath";

/** Reconcile resource interest against expansion, including collapsed ancestors. */
export function watchExpandedDirectories({
	model,
	candidates,
	watch,
	unwatch,
}: {
	model: FileTree;
	candidates: () => Iterable<string>;
	watch: (directory: string) => void;
	unwatch: (directory: string) => void;
}): () => void {
	const watched = new Set<string>();
	let syncing = false;
	const sync = () => {
		if (syncing) return;
		syncing = true;
		try {
			const visible = new Set<string>();
			for (const dir of new Set(candidates())) {
				if (!dir) continue;
				let current = dir;
				while (current && lookupDirectory(model, `${current}/`)?.isExpanded()) {
					current = current.includes("/")
						? current.slice(0, current.lastIndexOf("/"))
						: "";
				}
				if (!current) visible.add(dir);
			}
			for (const dir of watched) {
				if (!visible.has(dir)) {
					unwatch(dir);
					watched.delete(dir);
				}
			}
			for (const dir of visible) {
				if (watched.has(dir)) continue;
				watched.add(dir);
				watch(dir);
			}
		} finally {
			syncing = false;
		}
	};
	const unsubscribe = model.subscribe(sync);
	sync();
	return () => {
		unsubscribe();
		for (const dir of watched) unwatch(dir);
	};
}
