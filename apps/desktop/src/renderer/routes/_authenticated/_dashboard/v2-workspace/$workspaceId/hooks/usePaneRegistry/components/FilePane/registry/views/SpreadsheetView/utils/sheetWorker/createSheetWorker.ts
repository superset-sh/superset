export const createSheetWorker = (): Worker =>
	new Worker(new URL("./sheetWorker.ts", import.meta.url), { type: "module" });
