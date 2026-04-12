import PierreDiffsWorker from "@pierre/diffs/worker/worker.js?worker";

export const createPierreWorker = (): Worker => new PierreDiffsWorker();
