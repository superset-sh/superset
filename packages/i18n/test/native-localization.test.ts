import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { SUPPORTED_LOCALES } from "../src/locales";

const mobile = resolve(import.meta.dir, "../../../apps/mobile");
const permissionKeys = [
	"NSSpeechRecognitionUsageDescription",
	"NSPhotoLibraryUsageDescription",
	"NSCameraUsageDescription",
	"NSMicrophoneUsageDescription",
];
for (const locale of SUPPORTED_LOCALES) {
	test(`${locale}: native permissions, composer chrome, attachment empty states and plurals are complete`, async () => {
		const permission = await Bun.file(
			`${mobile}/locales/${locale}.json`,
		).json();
		for (const key of permissionKeys)
			expect(permission.ios[key]?.length).toBeGreaterThan(0);
		for (const module of ["composer", "attachments-sheet"]) {
			const source = await Bun.file(
				`${mobile}/modules/${module}/ios/Resources/${locale}.lproj/Localizable.strings`,
			).text();
			const english = await Bun.file(
				`${mobile}/modules/${module}/ios/Resources/en.lproj/Localizable.strings`,
			).text();
			const keys = (text: string) =>
				[...text.matchAll(/^"((?:[^"\\]|\\.)+)"\s*=/gm)].map(
					(match) => match[1],
				);
			expect(keys(source)).toEqual(keys(english));
			expect(source).not.toContain('= "";');
		}
		const plurals = await Bun.file(
			`${mobile}/modules/composer/ios/Resources/${locale}.lproj/Localizable.stringsdict`,
		).text();
		expect(plurals).toContain("<key>other</key>");
		expect(plurals).toContain("NSStringPluralRuleType");
		if (["pl", "ru", "cs"].includes(locale)) {
			expect(plurals).toContain("<key>few</key>");
			expect(plurals).toContain("<key>many</key>");
		}
	});
}
