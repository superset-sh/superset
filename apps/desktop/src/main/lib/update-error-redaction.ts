// Squirrel.Mac and electron-updater report a staging failure by printing the
// absolute path they were working on. That path starts in the user's home
// directory, so reporting the message as-is carries the account name of
// whoever hit the failure into the issue title, and from there into anywhere
// issue titles are republished. Strip the account segment and nothing else:
// the tool that failed, the file it wanted and the reason are what we triage
// on, and they have to survive intact.
//
// `Shared` is a real macOS directory rather than an account, so it is left
// alone; `\b` keeps that from swallowing an account merely starting with it.
const USER_HOME_PATH = /\/Users\/(?!Shared\b)[A-Za-z0-9._-]+/g;

// Every staging attempt unpacks into a freshly named `update.XXXXXXX`
// directory, so one recurring condition otherwise groups as a brand-new issue
// on every occurrence. Anchored on both slashes so it only ever rewrites a
// path segment — `update.zip` and `update.yml` are real filenames that carry
// meaning and must not be touched.
const STAGING_ATTEMPT_DIR = /\/update\.[A-Za-z0-9]+\//g;

export function redactUpdateErrorMessage(message: string): string {
	return message
		.replace(USER_HOME_PATH, "~")
		.replace(STAGING_ATTEMPT_DIR, "/update.<id>/");
}

/**
 * Returns an error safe to report, preserving the original when there is
 * nothing to redact so that errors reaching Sentry keep their identity.
 */
export function redactUpdateError(error: Error): Error {
	const message = redactUpdateErrorMessage(error.message);
	if (message === error.message) {
		return error;
	}
	const redacted = new Error(message);
	redacted.name = error.name;
	redacted.stack = error.stack
		? redactUpdateErrorMessage(error.stack)
		: undefined;
	return redacted;
}
