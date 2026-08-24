// Squirrel.Mac and electron-updater report a staging failure by printing the
// absolute path they were working on. That path starts in the user's home
// directory, so reporting the message as-is carries the account name of
// whoever hit the failure into the issue title, and from there into anywhere
// issue titles are republished. Strip the account segment and nothing else:
// the tool that failed, the file it wanted and the reason are what we triage
// on, and they have to survive intact.
//
// The updater ships on Windows and Linux as well as macOS and this handler
// reports all three, so all three home layouts are covered — the existing
// classifier already looks for an "-updater" path marker alongside "shipit"
// for exactly that reason. Each pattern carves out the directories under that
// root that are system locations rather than somebody's account. Each carve-out
// requires a path separator or end of string after the name: `\b` would also
// match before `.` and `-`, which would exempt real accounts like `Shared.dev`
// from redaction and leak exactly what this exists to remove. Windows paths are
// case-insensitive, so that pattern carries the `i` flag.
//
// The account segment is "everything up to the separator" rather than an ASCII
// class: account names are not ASCII in much of the world, and an ASCII class
// only partly rewrites an accented name and does not match a name written in a
// non-Latin script at all, leaking exactly what this exists to remove.
// Whitespace, quotes and colons end the segment too, so a path at the end of a
// sentence cannot run on and swallow the message after it. The carve-outs end
// on that same delimiter set rather than on the separator alone, so a reserved
// directory named at the end of a sentence (`/Users/Shared: access denied`) is
// still recognised as reserved instead of being rewritten as an account.
const MACOS_HOME_PATH = /\/Users\/(?!Shared(?:[/\s'":]|$))[^/\s'":]+/g;
// `/home/` only counts as the home root at the start of a path, so a deeper
// directory that merely ends in `/home` (`/var/lib/home/...`) is left alone.
const LINUX_HOME_PATH =
	/(?<![^\s'"])\/home\/(?!linuxbrew(?:[/\s'":]|$))[^/\s'":]+/g;
const WINDOWS_HOME_PATH =
	/[A-Za-z]:\\Users\\(?!(?:Public|Default|All Users)(?:[\\\s'":]|$))[^\\\s'":]+/gi;

// Every staging attempt unpacks into a freshly named `update.XXXXXXX`
// directory, so one recurring condition otherwise groups as a brand-new issue
// on every occurrence. Anchored on both slashes so it only ever rewrites a
// path segment — `update.zip` and `update.yml` are real filenames that carry
// meaning and must not be touched.
const STAGING_ATTEMPT_DIR = /\/update\.[A-Za-z0-9]+\//g;

export function redactUpdateErrorMessage(message: string): string {
	return message
		.replace(MACOS_HOME_PATH, "~")
		.replace(LINUX_HOME_PATH, "~")
		.replace(WINDOWS_HOME_PATH, "~")
		.replace(STAGING_ATTEMPT_DIR, "/update.<id>/");
}

/**
 * Returns an error safe to report, preserving the original when there is
 * nothing to redact so that errors reaching Sentry keep their identity.
 */
export function redactUpdateError(error: Error): Error {
	const message = redactUpdateErrorMessage(error.message);
	// The stack is checked too: a message can be clean while every frame carries
	// a home path, which is the ordinary case when the app is installed under
	// the user's own Applications folder.
	const stack =
		error.stack === undefined
			? undefined
			: redactUpdateErrorMessage(error.stack);
	if (message === error.message && stack === error.stack) {
		return error;
	}
	const redacted = new Error(message);
	redacted.name = error.name;
	redacted.stack = stack;
	// electron-updater attaches an own `code` to the errors it builds, and Sentry
	// serialises non-standard error properties, so rebuilding the error must
	// carry them across or the report loses its most triageable field. String
	// values go through the same redaction: a path can be carried out here too.
	for (const key of Object.keys(error)) {
		const value = (error as unknown as Record<string, unknown>)[key];
		(redacted as unknown as Record<string, unknown>)[key] =
			typeof value === "string" ? redactUpdateErrorMessage(value) : value;
	}
	return redacted;
}
