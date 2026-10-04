import { useEffect, useState } from "react";
import type {
	SheetSummary,
	UnreadableReason,
	WorkbookSource,
} from "../../types";
import {
	createSheetWorker,
	SheetWorkerClient,
	SheetWorkerError,
} from "../../utils/sheetWorker";

export type WorkbookState =
	| { status: "loading" }
	| { status: "ready"; client: SheetWorkerClient; sheets: SheetSummary[] }
	| { status: "error"; reason: UnreadableReason | null };

/** Parses the source in a worker, which then serves rows on demand. */
export function useWorkbook(
	source: WorkbookSource | null,
	createWorker: () => Worker = createSheetWorker,
): WorkbookState {
	const [state, setState] = useState<WorkbookState>({ status: "loading" });

	useEffect(() => {
		if (!source) {
			setState({ status: "loading" });
			return;
		}
		let worker: Worker;
		try {
			worker = createWorker();
		} catch {
			setState({ status: "error", reason: null });
			return;
		}
		const client = new SheetWorkerClient(worker);
		let cancelled = false;
		setState({ status: "loading" });
		client.request({ type: "open", source }).then(
			(sheets) => {
				if (!cancelled) setState({ status: "ready", client, sheets });
			},
			(error: unknown) => {
				client.dispose();
				if (cancelled) return;
				setState({
					status: "error",
					reason: error instanceof SheetWorkerError ? error.reason : null,
				});
			},
		);
		return () => {
			cancelled = true;
			client.dispose();
		};
	}, [source, createWorker]);

	return state;
}
