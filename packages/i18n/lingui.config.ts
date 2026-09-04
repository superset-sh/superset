import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";

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
	// Origins follow filesystem order, which differs between macOS and Linux
	// and would dirty the CI diff.
	format: formatter({ origins: false }),
	orderBy: "message",
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
