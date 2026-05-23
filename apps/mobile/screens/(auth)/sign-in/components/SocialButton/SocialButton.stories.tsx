import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { SocialButton } from "./SocialButton";

const meta: Meta<typeof SocialButton> = {
	title: "Components/SocialButton",
	component: SocialButton,
	parameters: {
		docs: {
			description: {
				component:
					"OAuth provider button. Outline button + brand-colored SVG icon. GitHub icon uses `theme.foreground` (token-driven, fixed in audit 2026-05-22 — was previously hardcoded white/black via useColorScheme). Google icon uses official brand hex colors per Google branding requirements — documented exception in screens/AUDIT.md.",
			},
		},
	},
	args: {
		provider: "github",
		disabled: false,
	},
	argTypes: {
		provider: {
			control: { type: "select" },
			options: ["github", "google"],
		},
		disabled: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof SocialButton>;

export const GitHub: Story = { args: { provider: "github" } };
export const Google: Story = { args: { provider: "google" } };
export const Disabled: Story = { args: { disabled: true } };

export const BothProviders: Story = {
	render: () => (
		<View className="gap-3 w-full">
			<SocialButton provider="github" />
			<SocialButton provider="google" />
		</View>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Canonical sign-in screen composition — both providers stacked vertically.",
			},
		},
	},
};
