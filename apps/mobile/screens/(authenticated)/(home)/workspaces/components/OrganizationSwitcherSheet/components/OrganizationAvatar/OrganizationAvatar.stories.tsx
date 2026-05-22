import type { Meta, StoryObj } from "@storybook/react-native";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { OrganizationAvatar } from "./OrganizationAvatar";

const meta: Meta<typeof OrganizationAvatar> = {
	title: "Components/OrganizationAvatar",
	component: OrganizationAvatar,
	parameters: {
		docs: {
			description: {
				component:
					"Organization avatar — renders the org logo if present, otherwise a token-themed initial fallback (`theme.muted` bg, `theme.mutedForeground` text). Used in tab-bar accessory, header button, switcher sheet rows. Token-compliant per screens/AUDIT.md.",
			},
		},
	},
	args: {
		name: "Superset",
		logo: null,
		size: 32,
	},
	argTypes: {
		name: { control: "text" },
		logo: { control: "text" },
		size: { control: { type: "range", min: 16, max: 96, step: 4 } },
	},
};

export default meta;

type Story = StoryObj<typeof OrganizationAvatar>;

export const FallbackSmall: Story = { args: { size: 24 } };
export const FallbackMedium: Story = { args: { size: 32 } };
export const FallbackLarge: Story = { args: { size: 64 } };
export const FallbackTwoWordName: Story = { args: { name: "Acme Corp" } };
export const FallbackNoName: Story = { args: { name: undefined } };

export const WithLogo: Story = {
	args: {
		name: "Vercel",
		logo: "https://logo.clearbit.com/vercel.com",
	},
};

export const SizeMatrix: Story = {
	render: () => (
		<View className="gap-4">
			<View className="flex-row items-center gap-4">
				<OrganizationAvatar name="Superset" size={20} />
				<OrganizationAvatar name="Superset" size={28} />
				<OrganizationAvatar name="Superset" size={36} />
				<OrganizationAvatar name="Superset" size={48} />
				<OrganizationAvatar name="Superset" size={64} />
			</View>
			<Text variant="muted" className="text-xs">
				Sizes: 20 · 28 · 36 · 48 · 64 px
			</Text>
		</View>
	),
};
