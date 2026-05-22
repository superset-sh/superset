/** @type {import('@storybook/react-native').StorybookConfig} */
const main = {
	stories: [
		"./stories/**/*.stories.?(ts|tsx|js|jsx)",
		"../components/**/*.stories.?(ts|tsx|js|jsx)",
		"../screens/**/*.stories.?(ts|tsx|js|jsx)",
	],
	addons: [
		"@storybook/addon-ondevice-controls",
		"@storybook/addon-ondevice-actions",
	],
};

module.exports = main;
