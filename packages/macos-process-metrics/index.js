let native;
try {
	native = require("./build/Release/macos_process_metrics.node");
} catch {
	// Non-macOS, or native build was skipped — fall back gracefully.
	native = null;
}

/**
 * Get the physical memory footprint (phys_footprint) for a list of PIDs.
 *
 * This is the same value macOS Activity Monitor shows in its "Memory"
 * column — it accounts for compressed pages and proportional shared
 * memory, unlike RSS which always reports the uncompressed size.
 *
 * @param {number[]} pids
 * @returns {Record<number, number>} PID → footprint in bytes.
 *   PIDs that don't exist or are inaccessible are silently omitted.
 *   Returns an empty object on non-macOS platforms.
 */
function getPhysFootprints(pids) {
	if (!native || !Array.isArray(pids) || pids.length === 0) {
		return {};
	}
	return native.getPhysFootprints(pids);
}

module.exports = { getPhysFootprints };
