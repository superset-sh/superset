import type { Preview } from "@storybook/react-vite";
import "./storybook.css";

const preview: Preview = {
	globalTypes: {
		theme: {
			description: "Color theme",
			toolbar: {
				title: "Theme",
				icon: "mirror",
				items: ["dark", "light"],
				dynamicTitle: true,
			},
		},
	},
	initialGlobals: {
		theme: "dark",
	},
	decorators: [
		(Story, context) => {
			const isDark = context.globals.theme !== "light";
			document.documentElement.classList.toggle("dark", isDark);
			return <Story />;
		},
	],
	parameters: {
		layout: "fullscreen",
		backgrounds: { disable: true },
	},
};

export default preview;
