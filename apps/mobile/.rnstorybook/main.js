/** @type {import('@storybook/react-native').StorybookConfig} */
const main = {
	stories: [
		"./stories/**/*.stories.?(ts|tsx|js|jsx)",
		"../components/**/*.stories.?(ts|tsx|js|jsx)",
		// "../screens/**/*.stories.?(ts|tsx|js|jsx)",
		// ^ Disabled 2026-05-22. Screen stories transitively import components
		// that use `useRouter`/`useNavigation` (OrganizationHeaderButton,
		// AuthenticatedTabBar, TabBarAccessory, OrgDropdown, MoreMenuScreen,
		// etc.). Storybook 9's `addon-ondevice-controls` eagerly evaluates story
		// render functions during `createPreparedStoryMapping`, which throws
		// "Couldn't find an UnhandledLinkingContext context" outside an active
		// expo-router NavigationContainer. The stories themselves carry comments
		// like "not renderable in Storybook isolation" — restore this glob and
		// add a nav-mock decorator to preview.tsx if/when those screens need
		// visual verification.
	],
	addons: [
		"@storybook/addon-ondevice-controls",
		"@storybook/addon-ondevice-actions",
	],
};

module.exports = main;
