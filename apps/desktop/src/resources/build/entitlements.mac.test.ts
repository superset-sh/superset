import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RESOURCES_DIR = join(import.meta.dirname);

function readPlist(filename: string): string {
	return readFileSync(join(RESOURCES_DIR, filename), "utf-8");
}

describe("macOS entitlements", () => {
	const mainPlist = readPlist("entitlements.mac.plist");
	const inheritPlist = readPlist("entitlements.mac.inherit.plist");

	test("main entitlements include Contacts (AddressBook) permission", () => {
		expect(mainPlist).toContain(
			"com.apple.security.personal-information.addressbook",
		);
	});

	test("inherit entitlements include Contacts (AddressBook) permission", () => {
		expect(inheritPlist).toContain(
			"com.apple.security.personal-information.addressbook",
		);
	});
});

describe("electron-builder macOS config", () => {
	test("extendInfo includes NSContactsUsageDescription", async () => {
		const config = await import("../../../electron-builder");
		const extendInfo = config.default.mac?.extendInfo;
		expect(extendInfo).toBeDefined();
		expect(extendInfo.NSContactsUsageDescription).toBeString();
		expect(extendInfo.NSContactsUsageDescription.length).toBeGreaterThan(0);
	});
});
