import type { Meta, StoryObj } from "@storybook/react-native";
import { Settings } from "lucide-react-native";
import { AppHeader } from "./AppHeader";

const meta: Meta<typeof AppHeader> = {
	title: "Molecules/AppHeader",
	component: AppHeader,
	parameters: {
		docs: {
			description: {
				component:
					"Top navigation header on every chat view. Three-region flex: leading back IconButton (optional) + centered title/subtitle + trailing actions IconButton (optional). `isScrolled` adds a layered shadow for separation from scrolling content. Composes first-party IconButton + Text.",
			},
		},
		layout: "fullscreen",
	},
	args: {
		title: "Fix auth bug",
		subtitle: "superset · main",
		showBack: true,
		showActions: true,
		isScrolled: false,
	},
	argTypes: {
		title: { control: "text" },
		subtitle: { control: "text" },
		showBack: { control: "boolean" },
		showActions: { control: "boolean" },
		isScrolled: { control: "boolean", description: "Adds 1px bottom shadow" },
	},
};

export default meta;

type Story = StoryObj<typeof AppHeader>;

export const Default: Story = {};

export const NoSubtitle: Story = {
	args: { subtitle: undefined },
};

export const NoBack: Story = {
	args: { showBack: false, title: "Sessions" },
};

export const SimpleNoActions: Story = {
	args: { subtitle: undefined, showActions: false },
};

export const Scrolled: Story = {
	args: { isScrolled: true },
};

export const CustomActionsIcon: Story = {
	args: { actionsIcon: Settings, actionsAccessibilityLabel: "Settings" },
};
