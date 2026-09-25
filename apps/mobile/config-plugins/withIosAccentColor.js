const { promises: fs } = require("node:fs");
const path = require("node:path");
const { withDangerousMod, withXcodeProject } = require("expo/config-plugins");

/**
 * iOS global accent color — the default tint system surfaces presented from
 * the app inherit (photo picker controls, alert buttons); iOS blue without
 * it. Expo has no app.json field for this.
 *
 * @type {import("expo/config-plugins").ConfigPlugin<{ color: string }>}
 */
const withIosAccentColor = (config, { color }) => {
	config = withXcodeProject(config, (config) => {
		const configurations = config.modResults.pbxXCBuildConfigurationSection();
		for (const key of Object.keys(configurations)) {
			const buildSettings = configurations[key]?.buildSettings;
			if (buildSettings?.PRODUCT_NAME) {
				buildSettings.ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME =
					"AccentColor";
			}
		}
		return config;
	});

	return withDangerousMod(config, [
		"ios",
		async (config) => {
			const value = color.replace(/^#/, "");
			const channel = (offset) =>
				(Number.parseInt(value.slice(offset, offset + 2), 16) / 255).toFixed(3);
			const colorset = path.join(
				config.modRequest.platformProjectRoot,
				config.modRequest.projectName ?? "Superset",
				"Images.xcassets",
				"AccentColor.colorset",
			);
			await fs.mkdir(colorset, { recursive: true });
			await fs.writeFile(
				path.join(colorset, "Contents.json"),
				`${JSON.stringify(
					{
						colors: [
							{
								color: {
									"color-space": "srgb",
									components: {
										red: channel(0),
										green: channel(2),
										blue: channel(4),
										alpha: "1.000",
									},
								},
								idiom: "universal",
							},
						],
						info: { author: "xcode", version: 1 },
					},
					null,
					2,
				)}\n`,
			);
			return config;
		},
	]);
};

module.exports = { withIosAccentColor };
