const ENVIRONMENT_ERRNO_CODES = [
	"ENOENT",
	"ENOTDIR",
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

// Replacing a bundle the user cannot write to needs an admin authorization,
// and Squirrel.Mac reports the prompt being cancelled (-60006) or refused
// (-60005) as an NSOSStatusErrorDomain error. Foundation localises the prose
// around it, so match the domain's name and the number, never the words. Any
// other OSStatus keeps reporting: a signing failure wears the same sentence.
const AUTHORIZATION_OSSTATUS = /OSStatus\D*-6000[56](?!\d)/;

// A server error from the release-artifact download is the CDN, not the
// artifact. A 4xx stays reported: an asset that is not there is ours to
// publish. Only the packaged app counts; electron-updater reports a failed
// feed (latest-mac.yml) fetch as an HttpError instead, which
// isUpstreamServerError classifies from its status code.
const DOWNLOAD_SERVER_ERROR =
	/^Cannot download ".*\.(?:zip|dmg|exe|AppImage|deb|rpm)", status 5\d\d(?!\d)/;

// The feed fetch fails upstream in two shapes, both retried by the next
// scheduled check: GitHub's edge answers 5xx during an incident, and its asset
// CDN answers 618 "jwt:expired" when the client follows the signed redirect
// after the token's five-minute window, which is a machine that slept
// mid-check. Everything from 500 up is the server's; a 4xx stays reported
// because a feed that is not there is ours to publish.
export function isUpstreamServerError(error: unknown): boolean {
	if (!(error instanceof Error) || error.name !== "HttpError") {
		return false;
	}
	const { statusCode } = error as Error & { statusCode?: unknown };
	return typeof statusCode === "number" && statusCode >= 500;
}

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
		lowerMessage.includes("the request timed out") ||
		AUTHORIZATION_OSSTATUS.test(message) ||
		DOWNLOAD_SERVER_ERROR.test(message)
	) {
		return true;
	}
	return (
		ENVIRONMENT_ERRNO_CODES.some((code) => message.includes(`${code}:`)) &&
		UPDATER_PATH_MARKERS.some((marker) => lowerMessage.includes(marker))
	);
}
