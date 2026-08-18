const ENVIRONMENT_ERRNO_CODES = [
	"ENOENT",
	"EACCES",
	"EPERM",
	"EBUSY",
	"ENOSPC",
];
const UPDATER_PATH_MARKERS = ["-updater", "shipit"];

// Staging an update downloads a ~600MB archive into the user's cache directory
// and unpacks it alongside itself, so a volume with less than this free cannot
// hold one however we behave.
export const UPDATE_STAGING_MIN_FREE_BYTES = 1024 * 1024 * 1024;

// Failures that are ours no matter what the disk looks like: we served a bad
// artifact, signed it wrong, or published an unreadable feed. A full volume
// does not cause any of these, so they must be checked before the free-space
// heuristic — otherwise a genuine release defect goes unreported for every
// user who happens to be low on space.
// Keep this list ahead of the release-artifact failure modes electron-updater
// can surface. A missing entry means that defect is silently suppressed for
// every user low on disk, which is the failure this ordering exists to prevent.
const UPDATER_DEFECT_PATTERNS = [
	"checksum", // mismatch, and "doesn't contain nor sha256 neither sha512 checksum"
	"code signature",
	"codesign",
	"cannot parse update info",
	"cannot find channel",
	"no files provided",
];

// Update failures owned by the user's machine, not by us. A full volume is the
// common one, and neither staging tool gives us a code to match: `ditto` prints
// an errno-free line and Squirrel forwards NSError text localised to the user's
// language, so ask the filesystem how much room is left rather than reading the
// words. The rest — a corrupt or half-removed updater cache, an app bundle that
// can't be written, stalled requests — arrive as plain messages without errno
// properties, so those still match on the text.
export function isEnvironmentUpdateError(
	message: string,
	freeStagingBytes: number | null,
): boolean {
	const lowerMessage = message.toLowerCase();
	if (
		UPDATER_DEFECT_PATTERNS.some((pattern) => lowerMessage.includes(pattern))
	) {
		return false;
	}
	if (
		freeStagingBytes !== null &&
		freeStagingBytes < UPDATE_STAGING_MIN_FREE_BYTES
	) {
		return true;
	}
	if (
		lowerMessage.includes("read-only volume") ||
		lowerMessage.includes("the request timed out")
	) {
		return true;
	}
	return (
		ENVIRONMENT_ERRNO_CODES.some((code) => message.includes(`${code}:`)) &&
		UPDATER_PATH_MARKERS.some((marker) => lowerMessage.includes(marker))
	);
}
