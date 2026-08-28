module.exports = (api) => {
	api.cache(true);
	return {
		presets: ["babel-preset-expo"],
		plugins: [
			"@lingui/babel-plugin-lingui-macro",
			[
				"react-native-worklets/plugin",
				{
					bundleMode: true,
					workletizableModules: ["remend"],
				},
			],
		],
	};
};
