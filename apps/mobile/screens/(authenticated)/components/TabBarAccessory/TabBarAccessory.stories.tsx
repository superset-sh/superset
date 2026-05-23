import Ionicons from "@expo/vector-icons/Ionicons";
import type { Meta, StoryObj } from "@storybook/react-native";
import { ChevronsUpDown } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { OrganizationAvatar } from "@/screens/(authenticated)/(home)/workspaces/components/OrganizationSwitcherSheet/components/OrganizationAvatar";

/**
 * The real `TabBarAccessory` depends on the `useOrganizations` hook (Electric
 * collection query) + `useRouter` (expo-router) + `useWindowDimensions`. The
 * latter two are infrastructure that don't render in Storybook; the former
 * requires a mounted collection provider.
 *
 * This story renders the *inner row layout* using the same primitives and
 * tokens, with mock organization data. The audit target is the row; the
 * `OrganizationSwitcherSheet` it opens is a separate story.
 */
function TabBarAccessoryPreview({
	orgName,
	orgLogo,
}: {
	orgName: string;
	orgLogo: string | null;
}) {
	const theme = useTheme();
	return (
		<View className="flex-row items-center justify-between px-4 py-2">
			<Pressable className="flex-row items-center gap-2">
				<OrganizationAvatar name={orgName} logo={orgLogo} size={24} />
				<Text
					className="text-sm font-semibold"
					style={{ color: theme.foreground }}
				>
					{orgName}
				</Text>
				<ChevronsUpDown size={12} color={theme.mutedForeground} />
			</Pressable>
			<Pressable hitSlop={8}>
				<Ionicons
					name="settings-sharp"
					size={20}
					color={theme.mutedForeground}
				/>
			</Pressable>
		</View>
	);
}

const meta: Meta<typeof TabBarAccessoryPreview> = {
	title: "Components/TabBarAccessory",
	component: TabBarAccessoryPreview,
	parameters: {
		docs: {
			description: {
				component:
					"Tab-bar accessory row — org switcher trigger (left) + settings gear (right). Lives above the tab bar in authenticated routes. Real component pulls org from `useOrganizations` and opens `OrganizationSwitcherSheet` on org tap. Token-clean: colors via `useTheme()`, layout via Tailwind. Per screens/AUDIT.md.",
			},
		},
	},
	args: {
		orgName: "Superset",
		orgLogo: null,
	},
	argTypes: {
		orgName: { control: "text" },
		orgLogo: { control: "text" },
	},
};

export default meta;

type Story = StoryObj<typeof TabBarAccessoryPreview>;

export const Default: Story = {};
export const WithLogo: Story = {
	args: {
		orgName: "Vercel",
		orgLogo: "https://logo.clearbit.com/vercel.com",
	},
};
export const LongOrgName: Story = {
	args: { orgName: "Acme Corporation International" },
};
