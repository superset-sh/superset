// Some Electron builds bundle a Node whose stream module predates
// getDefaultHighWaterMark, which dependencies call at import time. This has to
// run before any of them load, so it is its own rollup entry.
type StreamModule = {
	getDefaultHighWaterMark?: (isObjectMode: boolean) => number;
};

try {
	const stream = require("node:stream") as StreamModule;
	if (typeof stream.getDefaultHighWaterMark !== "function") {
		stream.getDefaultHighWaterMark = (isObjectMode) =>
			isObjectMode ? 16 : 16 * 1024;
		console.log(
			"[patch-node-stream] polyfilled stream.getDefaultHighWaterMark",
		);
	}
} catch (err) {
	console.error(
		"[patch-node-stream] failed to apply patch",
		err instanceof Error ? err.message : err,
	);
}
