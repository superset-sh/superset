import { writeFileSync } from "node:fs";
import { plugin } from "bun";

plugin({
	name: "reject-japanese-catalog",
	setup(build) {
		build.onLoad({ filter: /locales\/ja\/messages\.ts$/ }, () => ({
			contents:
				'throw new Error("catalog unavailable"); export const messages = {};',
			loader: "ts",
		}));
	},
});
const { i18n, initI18n, initI18nAsync } = await import("../../src/index");
initI18n("en");
const pending = initI18nAsync("ja");
await initI18nAsync("fr");
let rejected = false;
try {
	await pending;
} catch {
	rejected = true;
}
if (!rejected) throw new Error("Catalog failure was not reported");
if (i18n.locale !== "fr")
	throw new Error("A failed load changed the latest locale");
await initI18nAsync("en");
if (String(i18n.locale) !== "en")
	throw new Error("Cannot recover from failed catalog");
const outputFile = process.argv[2];
if (!outputFile) throw new Error("Missing output path");
writeFileSync(outputFile, "passed");
