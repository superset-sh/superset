import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";

// One catalog set for every surface. Extraction sweeps all app and package
// source; `lingui extract` runs from this package (hooked on pretypecheck),
// and `lingui compile --strict` gates CI via the `check` script.
export default defineConfig({
	sourceLocale: "en",
	locales: [
		"en",
		"ja",
		"zh-CN",
		"fr",
		"ko",
		"zh-TW",
		"es",
		"de",
		"pt-BR",
		"it",
		"ru",
		"tr",
		"pl",
		"nl",
		"id",
		"cs",
		"vi",
	],
	// lineNumbers off: line-only churn in .po files would dirty every PR that
	// moves code, and the CI drift check diffs this file.
	format: formatter({ lineNumbers: false }),
	// messageId ordering is total (ids are unique); the default text ordering
	// tie-breaks identical strings by filesystem traversal order, which
	// differs between macOS and Linux and dirties the CI drift check.
	orderBy: "messageId",
	compileNamespace: "ts",
	catalogs: [
		{
			path: "<rootDir>/locales/{locale}/messages",
			include: [
				"<rootDir>/../../apps/desktop/src",
				"<rootDir>/../../apps/web/src",
				"<rootDir>/../../apps/marketing/src",
				"<rootDir>/../../apps/admin/src",
				"<rootDir>/../../apps/docs/src",
				"<rootDir>/../../apps/mobile/app",
				"<rootDir>/../../apps/mobile/screens",
				"<rootDir>/../../apps/mobile/components",
				"<rootDir>/../../apps/mobile/hooks",
				"<rootDir>/../../apps/mobile/lib",
				"<rootDir>/../../packages/ui/src",
				"<rootDir>/../../packages/chat-ui/src",
				"<rootDir>/../../packages/shared/src",
				"<rootDir>/src",
			],
			exclude: ["**/node_modules/**", "**/*.test.*", "**/*.stories.*"],
		},
	],
});
