import PierreDiffsWorker from "@pierre/diffs/worker/worker.js?worker";

export const createPierreWorker = (): Worker => {
	console.log("[pierre] instantiating worker");
	const worker = new PierreDiffsWorker();
	worker.addEventListener("error", (event) => {
		console.error("[pierre] worker error", event);
	});
	worker.addEventListener("messageerror", (event) => {
		console.error("[pierre] worker messageerror", event);
	});
	return worker;
};
