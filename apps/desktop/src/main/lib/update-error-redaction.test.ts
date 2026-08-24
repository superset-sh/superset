import { describe, expect, test } from "bun:test";
import {
	redactUpdateError,
	redactUpdateErrorMessage,
} from "./update-error-redaction";

// The failure this redaction exists for, with invented account names and
// staging tokens. Two machines, two staging attempts, one condition.
const DITTO_MISSING_ASAR_ADA =
	"ditto: /Users/ada/Library/Caches/com.superset.desktop.ShipIt/update.qZ4mTb1/Superset.app/Contents/Resources/app.asar: No such file or directory";
const DITTO_MISSING_ASAR_GRACE =
	"ditto: /Users/grace.h/Library/Caches/com.superset.desktop.ShipIt/update.Kd9wRp7/Superset.app/Contents/Resources/app.asar: No such file or directory";

// Messages that carry no home directory at all. Every one of these must come
// back byte-for-byte, or the redaction is destroying evidence we rely on.
const CHECKSUM_MISMATCH =
	"sha512 checksum mismatch, expected 1PbOs3lC, got fT2wPk9d";
const SIGNATURE_FAILURE =
	'Could not get code signature for running application: Error: Command failed: codesign --verify -vvvv "/Applications/Superset.app"';
const SYSTEM_LIBRARY_PATH =
	"ENOENT: no such file or directory, open '/Library/Application Support/Superset/update.log'";
const TEMP_PATH =
	"ditto: /tmp/superset-updater/pending/Superset-1.24.0-mac.zip: Operation not permitted";
const VERSION_TEXT =
	"Cannot update from 1.22.0 to 1.24.0: update.yml is newer than update.zip";
const SQUIRREL_NO_SPACE_ES =
	"El archivo no puede guardarse porque no queda suficiente espacio.";

describe("redactUpdateErrorMessage", () => {
	test("removes the account name from a staged-update failure", () => {
		const redacted = redactUpdateErrorMessage(DITTO_MISSING_ASAR_ADA);
		expect(redacted).not.toContain("ada");
		expect(redacted).not.toContain("/Users/");
		// The parts we actually triage on survive.
		expect(redacted).toContain("ditto:");
		expect(redacted).toContain("app.asar");
		expect(redacted).toContain("No such file or directory");
		expect(redacted).toBe(
			"ditto: ~/Library/Caches/com.superset.desktop.ShipIt/update.<id>/Superset.app/Contents/Resources/app.asar: No such file or directory",
		);
	});

	test("converges the same failure from two different accounts", () => {
		expect(redactUpdateErrorMessage(DITTO_MISSING_ASAR_ADA)).toBe(
			redactUpdateErrorMessage(DITTO_MISSING_ASAR_GRACE),
		);
	});

	test("passes messages without a home directory through unchanged", () => {
		for (const message of [
			CHECKSUM_MISMATCH,
			SIGNATURE_FAILURE,
			SYSTEM_LIBRARY_PATH,
			TEMP_PATH,
			VERSION_TEXT,
			SQUIRREL_NO_SPACE_ES,
		]) {
			expect(redactUpdateErrorMessage(message)).toBe(message);
		}
	});

	test("leaves paths that are not a user home alone", () => {
		// /Users/Shared is a real macOS directory, not somebody's account.
		expect(
			redactUpdateErrorMessage(
				"ditto: /Users/Shared/Superset/staged.zip: I/O error",
			),
		).toBe("ditto: /Users/Shared/Superset/staged.zip: I/O error");
		// ...but an account that merely starts with "Shared" is still an account.
		expect(redactUpdateErrorMessage("/Users/Sharedrive/Library")).toBe(
			"~/Library",
		);
		expect(redactUpdateErrorMessage("/UsersGuide/readme.txt")).toBe(
			"/UsersGuide/readme.txt",
		);
	});

	test("rewrites only the staging directory segment, not similarly named files", () => {
		expect(
			redactUpdateErrorMessage(
				"ditto: ./update.zip: Couldn't read pkzip signature.",
			),
		).toBe("ditto: ./update.zip: Couldn't read pkzip signature.");
		expect(redactUpdateErrorMessage("Cannot parse update.yml")).toBe(
			"Cannot parse update.yml",
		);
	});
});

describe("redactUpdateError", () => {
	test("returns the very same error when there is nothing to redact", () => {
		const error = new Error(CHECKSUM_MISMATCH);
		expect(redactUpdateError(error)).toBe(error);
	});

	test("keeps the error name and redacts the stack too", () => {
		const error = new Error(DITTO_MISSING_ASAR_ADA);
		error.name = "UpdaterError";
		error.stack = `UpdaterError: ${DITTO_MISSING_ASAR_ADA}\n    at /Users/ada/Applications/Superset.app/Contents/Resources/app.asar/main.js:1:1`;

		const redacted = redactUpdateError(error);

		expect(redacted.name).toBe("UpdaterError");
		expect(redacted.message).not.toContain("ada");
		expect(redacted.stack).not.toContain("/Users/");
		expect(redacted.stack).toContain("main.js:1:1");
	});

	test("does not invent a stack for an error that never had one", () => {
		const error = new Error(DITTO_MISSING_ASAR_ADA);
		error.stack = undefined;
		expect(redactUpdateError(error).stack).toBeUndefined();
	});
});

// The updater ships on Windows (nsis) and Linux (AppImage) as well as macOS,
// and the same handler reports all three. Their staging directories live under
// the user's home too — which is why the existing classifier already looks for
// an "-updater" path marker alongside "shipit".
describe("redactUpdateErrorMessage across platforms", () => {
	test("removes the account name from a Linux staging path", () => {
		const redacted = redactUpdateErrorMessage(
			"ENOENT: no such file or directory, open '/home/ada/.cache/superset-updater/pending/Superset.AppImage'",
		);
		expect(redacted).not.toContain("ada");
		expect(redacted).toBe(
			"ENOENT: no such file or directory, open '~/.cache/superset-updater/pending/Superset.AppImage'",
		);
	});

	test("removes the account name from a Windows staging path", () => {
		const redacted = redactUpdateErrorMessage(
			"EBUSY: resource busy or locked, open 'C:\\Users\\grace.h\\AppData\\Local\\superset-updater\\installer.exe'",
		);
		expect(redacted).not.toContain("grace.h");
		expect(redacted).toBe(
			"EBUSY: resource busy or locked, open '~\\AppData\\Local\\superset-updater\\installer.exe'",
		);
	});

	test("converges the same Linux failure from two different accounts", () => {
		expect(
			redactUpdateErrorMessage("ditto: /home/ada/.cache/x: I/O error"),
		).toBe(
			redactUpdateErrorMessage("ditto: /home/grace.h/.cache/x: I/O error"),
		);
	});

	// Negative cases: real system directories that are not somebody's account,
	// and a "/home/" that is only a substring of a deeper path.
	test("leaves non-account system directories alone", () => {
		for (const message of [
			"EPERM: operation not permitted, open 'C:\\Users\\Public\\Desktop\\Superset.lnk'",
			"EPERM: operation not permitted, open 'C:\\Users\\Default\\NTUSER.DAT'",
			"ditto: /home/linuxbrew/.linuxbrew/bin/superset: Permission denied",
			"ENOENT: no such file or directory, open '/var/lib/home/superset/cache'",
		]) {
			expect(redactUpdateErrorMessage(message)).toBe(message);
		}
	});
});
