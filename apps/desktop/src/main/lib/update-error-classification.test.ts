import { describe, expect, test } from "bun:test";
import { isEnvironmentUpdateError } from "./update-error-classification";

const GIGABYTE = 1024 * 1024 * 1024;
const FULL_VOLUME = 40 * 1024 * 1024;
const ROOMY_VOLUME = 60 * GIGABYTE;

// Captured from production, with the account name and archive digest replaced.
const DITTO_NO_SPACE_EN = [
	"ditto: /Users/<user>/Library/Caches/com.superset.desktop.ShipIt/update.aBcDeF1/Superset.app/Contents/Resources/app.asar: No space left on device",
	"ditto: Couldn't read pkzip signature.",
].join("\n");
const SQUIRREL_NO_SPACE_ES =
	"El archivo “<digest>.zip” no puede guardarse porque no queda suficiente espacio.: No hay suficiente espacio. Elimina algunos archivos del volumen e inténtalo de nuevo.";

const CHECKSUM_MISMATCH =
	"sha512 checksum mismatch, expected 1PbOs3lC, got fT2wPk9d";
const SIGNATURE_FAILURE =
	'Could not get code signature for running application: Error: Command failed: codesign --verify -vvvv "/Applications/Superset.app"';
const FEED_FAILURE =
	"HttpError: 404 Not Found\nCannot parse update info from latest-mac.yml";
// Further electron-updater release-artifact defects. Each must survive a full
// volume; a gap here silences a bad release for the users least able to cope.
const MISSING_CHANNEL = "Cannot find channel “latest-mac.yml” update info";
const NO_FILES = "No files provided in update info";
const NO_CHECKSUM =
	"Update info doesn't contain nor sha256 neither sha512 checksum";
// Squirrel.Mac's own signature check on the staged bundle. These are ours by
// policy and must keep reporting whatever else the machine looks like.
const STAGED_SIGNATURE_REJECTED =
	"Code signature at URL file:///Users/<user>/Library/Caches/com.superset.desktop.ShipIt/update.aBcDeF1/Superset.app/ did not pass validation: code failed to satisfy specified code requirement(s)";
const STAGED_UNSIGNED =
	"Code signature at URL file:///Users/<user>/Library/Caches/com.superset.desktop.ShipIt/update.aBcDeF1/Superset.app/ did not pass validation: code object is not signed at all";

// Squirrel needs an admin authorization to replace a bundle the user cannot
// write to. Foundation localises the prose around the OSStatus number.
const AUTHORIZATION_CANCELLED_EN =
	"The operation couldn’t be completed. (OSStatus error -60006.)";
const AUTHORIZATION_DENIED_EN =
	"The operation couldn’t be completed. (OSStatus error -60005.)";
const AUTHORIZATION_DENIED_DE =
	"Der Vorgang konnte nicht abgeschlossen werden. (OSStatus-Fehler -60005.)";
const LAUNCHD_JOB_DISABLED = "The command is disabled and cannot be executed";
const CACHE_PATH_IS_A_FILE =
	"ENOTDIR: not a directory, mkdir '/Users/<user>/Library/Caches/@supersetdesktop-updater/pending'";
const DOWNLOAD_GATEWAY_TIMEOUT =
	'Cannot download "https://github.com/superset-sh/superset/releases/latest/download/Superset-1.26.0-arm64-mac.zip", status 504: ';
const DOWNLOAD_BAD_GATEWAY =
	'Cannot download "https://github.com/superset-sh/superset/releases/latest/download/Superset-1.26.0-arm64-mac.zip", status 502: Bad Gateway';
const DOWNLOAD_NOT_FOUND =
	'Cannot download "https://github.com/superset-sh/superset/releases/latest/download/Superset-1.26.0-arm64-mac.zip", status 404: Not Found';
const DITTO_STAGING_FILE_MISSING =
	"ditto: /Users/<user>/Library/Caches/com.superset.desktop.ShipIt/update.aBcDeF1/Superset.app/Contents/Resources/app.asar: No such file or directory";

describe("isEnvironmentUpdateError", () => {
	test("classifies a full staging volume without reading the message", () => {
		expect(isEnvironmentUpdateError(DITTO_NO_SPACE_EN, FULL_VOLUME)).toBe(true);
		expect(isEnvironmentUpdateError(SQUIRREL_NO_SPACE_ES, FULL_VOLUME)).toBe(
			true,
		);
	});

	test("reports those same failures when the volume has room", () => {
		expect(isEnvironmentUpdateError(DITTO_NO_SPACE_EN, ROOMY_VOLUME)).toBe(
			false,
		);
		expect(isEnvironmentUpdateError(SQUIRREL_NO_SPACE_ES, ROOMY_VOLUME)).toBe(
			false,
		);
	});

	test("reports genuine updater bugs", () => {
		for (const message of [
			CHECKSUM_MISMATCH,
			SIGNATURE_FAILURE,
			FEED_FAILURE,
		]) {
			expect(isEnvironmentUpdateError(message, ROOMY_VOLUME)).toBe(false);
			expect(isEnvironmentUpdateError(message, null)).toBe(false);
		}
	});

	test("still reports our own defects even while the volume is full", () => {
		// A full disk does not corrupt a download or break a signature. If these
		// were suppressed, a bad release would go unreported for exactly the
		// users least able to recover from it.
		for (const message of [
			CHECKSUM_MISMATCH,
			SIGNATURE_FAILURE,
			FEED_FAILURE,
			MISSING_CHANNEL,
			NO_FILES,
			NO_CHECKSUM,
		]) {
			expect(isEnvironmentUpdateError(message, FULL_VOLUME)).toBe(false);
			expect(isEnvironmentUpdateError(message, ROOMY_VOLUME)).toBe(false);
		}
	});

	test("still treats an unrecognised failure on a full volume as environmental", () => {
		expect(
			isEnvironmentUpdateError("something we have never seen", FULL_VOLUME),
		).toBe(true);
	});

	test("keeps the existing errno and read-only classifications", () => {
		expect(
			isEnvironmentUpdateError(
				"ENOENT: no such file or directory, rename '/Users/<user>/Library/Caches/superset-updater/pending/x.zip'",
				ROOMY_VOLUME,
			),
		).toBe(true);
		expect(
			isEnvironmentUpdateError(
				"Error: Cannot update while running on a read-only volume",
				ROOMY_VOLUME,
			),
		).toBe(true);
		expect(
			isEnvironmentUpdateError(
				"ENOENT: no such file or directory",
				ROOMY_VOLUME,
			),
		).toBe(false);
	});

	test("classifies a refused or cancelled admin authorization by OSStatus number", () => {
		for (const message of [
			AUTHORIZATION_CANCELLED_EN,
			AUTHORIZATION_DENIED_EN,
			AUTHORIZATION_DENIED_DE,
		]) {
			expect(isEnvironmentUpdateError(message, ROOMY_VOLUME)).toBe(true);
			expect(isEnvironmentUpdateError(message, null)).toBe(true);
		}
	});

	test("does not extend the authorization match to other OSStatus codes", () => {
		// errSecCSSignatureFailed: a signature problem wearing the same prose.
		expect(
			isEnvironmentUpdateError(
				"The operation couldn’t be completed. (OSStatus error -67062.)",
				ROOMY_VOLUME,
			),
		).toBe(false);
		expect(
			isEnvironmentUpdateError(
				"The operation couldn’t be completed. (OSStatus error -600051.)",
				ROOMY_VOLUME,
			),
		).toBe(false);
	});

	test("still reports a signature failure that also carries an authorization code", () => {
		expect(
			isEnvironmentUpdateError(
				`${STAGED_SIGNATURE_REJECTED} ${AUTHORIZATION_CANCELLED_EN}`,
				ROOMY_VOLUME,
			),
		).toBe(false);
		expect(
			isEnvironmentUpdateError(
				`${STAGED_SIGNATURE_REJECTED} ${AUTHORIZATION_CANCELLED_EN}`,
				FULL_VOLUME,
			),
		).toBe(false);
	});

	test("keeps reporting Squirrel's staged-bundle signature rejections", () => {
		for (const message of [STAGED_SIGNATURE_REJECTED, STAGED_UNSIGNED]) {
			expect(isEnvironmentUpdateError(message, ROOMY_VOLUME)).toBe(false);
			expect(isEnvironmentUpdateError(message, FULL_VOLUME)).toBe(false);
		}
	});

	test("classifies launchd refusing a disabled ShipIt job", () => {
		expect(isEnvironmentUpdateError(LAUNCHD_JOB_DISABLED, ROOMY_VOLUME)).toBe(
			true,
		);
	});

	test("classifies a file sitting where the updater cache must be", () => {
		expect(isEnvironmentUpdateError(CACHE_PATH_IS_A_FILE, ROOMY_VOLUME)).toBe(
			true,
		);
		// The same errno off the updater paths is not the updater's business.
		expect(
			isEnvironmentUpdateError(
				"ENOTDIR: not a directory, open '/Applications/Superset.app/Contents/Resources/app.asar'",
				ROOMY_VOLUME,
			),
		).toBe(false);
	});

	test("classifies a server error on the release download, not a missing asset", () => {
		expect(
			isEnvironmentUpdateError(DOWNLOAD_GATEWAY_TIMEOUT, ROOMY_VOLUME),
		).toBe(true);
		expect(isEnvironmentUpdateError(DOWNLOAD_BAD_GATEWAY, ROOMY_VOLUME)).toBe(
			true,
		);
		expect(isEnvironmentUpdateError(DOWNLOAD_NOT_FOUND, ROOMY_VOLUME)).toBe(
			false,
		);
	});

	test("keeps reporting a server error while fetching the feed itself", () => {
		expect(
			isEnvironmentUpdateError(
				'Cannot download "https://github.com/superset-sh/superset/releases/latest/download/latest-mac.yml", status 502: Bad Gateway',
				ROOMY_VOLUME,
			),
		).toBe(false);
	});

	test("does not take the ShipIt name alone as proof of a staging failure", () => {
		expect(
			isEnvironmentUpdateError(
				"ditto: /Applications/ShipIt Tools/Superset.app/Contents/Resources/app.asar: No such file or directory",
				ROOMY_VOLUME,
			),
		).toBe(false);
	});

	test("classifies a staged copy that lost a file under ShipIt's directory", () => {
		expect(
			isEnvironmentUpdateError(DITTO_STAGING_FILE_MISSING, ROOMY_VOLUME),
		).toBe(true);
		// ditto complaining about the installed bundle is not a staging failure.
		expect(
			isEnvironmentUpdateError(
				"ditto: /Applications/Superset.app/Contents/Resources/app.asar: No such file or directory",
				ROOMY_VOLUME,
			),
		).toBe(false);
	});
});
