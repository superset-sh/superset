/** @type {import('@storybook/react-native').StorybookConfig} */
const main = {
	stories: [
		"./stories/**/*.stories.?(ts|tsx|js|jsx)",
		"../components/**/*.stories.?(ts|tsx|js|jsx)",
		// Wave 4 — chat-view view stories (pixel-perfect Phase 6 COMPOSE).
		// Narrow glob points only at `screens/chat-view/` because nothing in
		// that subtree imports expo-router or `useTheme`. The broader
		// `../screens/**` glob remains disabled — adding it would re-trigger
		// the prep-time `UnhandledLinkingContext` crash described below.
		"../screens/chat-view/**/*.stories.?(ts|tsx|js|jsx)",
		// Wave 5 — sessions-list view stories. Same narrow-glob constraint as
		// chat-view (above): nothing in this subtree imports expo-router or
		// `useTheme`, so prep-time `loadStory` is safe.
		"../screens/sessions-list/**/*.stories.?(ts|tsx|js|jsx)",
		// "../screens/**/*.stories.?(ts|tsx|js|jsx)",
		// ^ Disabled 2026-05-22. Screen placeholder stories transitively import
		// `useTheme` → `lib/theme.ts` → `expo-router/react-navigation`. Storybook 9
		// RN's `loadStory` (called during `createPreparedStoryMapping`) evaluates
		// each story module eagerly BEFORE decorators apply, and ends up calling
		// expo-router's `useLinking` family which crashes accessing the default
		// `UnhandledLinkingContext` value outside a `<NavigationContainer>`.
		//
		// Wrapping decorators in `<NavigationContainer>` from
		// `expo-router/react-navigation` (kept in preview.tsx) does NOT help here
		// because Storybook's prep-time render happens outside the decorator chain.
		//
		// To restore screen stories: refactor them to avoid `useTheme` / decouple
		// from `lib/theme.ts` (mirror the pattern used in components/ScrollFade),
		// or use `expo-router/testing-library`'s `renderRouter` helper inside a
		// custom story `render` function.
	],
	addons: [
		"@storybook/addon-ondevice-controls",
		"@storybook/addon-ondevice-actions",
	],
};

module.exports = main;
