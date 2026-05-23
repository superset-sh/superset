import type { Meta, StoryObj } from "@storybook/react-native";
import { ChevronsUpDown } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { OrganizationAvatar } from "../OrganizationSwitcherSheet/components/OrganizationAvatar";

/**
 * The real `OrganizationHeaderButton` mounts inside `expo-router`'s `<Stack.Toolbar>`
 * placement, which does not render outside of an expo-router navigator context.
 *
 * This story renders the *inner content* of the toolbar button using the same
 * primitives and tokens — `OrganizationAvatar` + Text + `ChevronsUpDown`. The
 * inner layout is the audit surface; the toolbar wrapper is a positional
 * affordance that lives in the real navigation host.
 */
function OrganizationHeaderButtonPreview({
	name,
	logo,
	onPress,
}: {
	name?: string;
	logo?: string | null;
	onPress: () => void;
}) {
	const theme = useTheme();
	return (
		<View className="bg-card border-border rounded-lg border p-4">
			<Pressable onPress={onPress} className="flex-row items-center gap-2">
				<OrganizationAvatar name={name} logo={logo} size={28} />
				<Text className="text-xl font-semibold text-foreground">
					{name ?? "Organization"}
				</Text>
				<ChevronsUpDown size={14} color={theme.mutedForeground} />
			</Pressable>
		</View>
	);
}

const meta: Meta<typeof OrganizationHeaderButtonPreview> = {
	title: "Components/OrganizationHeaderButton",
	component: OrganizationHeaderButtonPreview,
	parameters: {
		docs: {
			description: {
				component:
					"Header pressable for the workspaces screen — opens the organization switcher sheet. **Renders inside expo-router Stack.Toolbar in the real app**; this story renders the inner content only. Fixed in audit 2026-05-22 — chevron color was previously hardcoded `hsl(240 5% 64.9%)` (old cool-neutral); now resolves via `theme.mutedForeground`.",
			},
		},
	},
	args: {
		name: "Superset",
		logo: null,
		onPress: () => undefined,
	},
	argTypes: {
		name: { control: "text" },
		logo: { control: "text" },
	},
};

export default meta;

type Story = StoryObj<typeof OrganizationHeaderButtonPreview>;

export const Default: Story = {};
export const LongName: Story = {
	args: { name: "Acme Long Organization Name LLC" },
};
export const WithLogo: Story = {
	args: { name: "Vercel", logo: "https://logo.clearbit.com/vercel.com" },
};
export const NoName: Story = { args: { name: undefined } };
