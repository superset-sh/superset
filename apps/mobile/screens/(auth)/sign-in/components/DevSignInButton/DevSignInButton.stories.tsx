import type { Meta, StoryObj } from "@storybook/react-native";
import { DevSignInButton } from "./DevSignInButton";

const meta: Meta<typeof DevSignInButton> = {
	title: "Components/DevSignInButton",
	component: DevSignInButton,
	parameters: {
		docs: {
			description: {
				component:
					"Dev-only sign-in shortcut on the sign-in screen — bypasses OAuth and signs in as Local Admin (admin@local.test) for local development. Real auth call happens on press; in Storybook the button still calls into auth-client which will error harmlessly without a configured backend. Token-clean (uses Button outline variant + `text-destructive` for error). Per screens/AUDIT.md.",
			},
		},
	},
};

export default meta;

type Story = StoryObj<typeof DevSignInButton>;

export const Default: Story = {};
