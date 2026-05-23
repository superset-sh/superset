import type { Meta, StoryObj } from "@storybook/react-native";
import {
	ArrowLeftRight,
	ChevronDown,
	LogOut,
	Settings,
	UserPlus,
} from "lucide-react-native";
import { View } from "react-native";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

/**
 * The real `OrgDropdown` depends on the full auth + Electric collections stack
 * (authClient.useSession, useLiveQuery on collections.organizations,
 * useSignOut, useCollections). Wiring those in Storybook would require a
 * fully-mocked QueryClient + collection provider — out of scope for a story.
 *
 * This story renders the *visual surface* using the same primitives and tokens
 * as the real component, with mock org data. The token audit is on this
 * layout. The data integration is verified in the running app.
 */
function OrgDropdownPreview({
	activeOrgName,
	switchableOrgs,
	disabled,
}: {
	activeOrgName: string;
	switchableOrgs: string[];
	disabled: boolean;
}) {
	const orgInitial = activeOrgName.charAt(0).toUpperCase();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<View className="flex-row items-center gap-3 px-4 py-3">
					<Avatar alt={activeOrgName} className="size-9">
						<AvatarFallback>
							<Text className="text-sm font-semibold">{orgInitial}</Text>
						</AvatarFallback>
					</Avatar>
					<View className="flex-1">
						<Text className="text-base font-semibold" numberOfLines={1}>
							{activeOrgName}
						</Text>
					</View>
					<Icon as={ChevronDown} className="text-muted-foreground size-4" />
				</View>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-56" align="start" side="bottom">
				<DropdownMenuItem>
					<Icon as={Settings} className="text-foreground size-4" />
					<Text>Settings</Text>
				</DropdownMenuItem>
				<DropdownMenuItem>
					<Icon as={UserPlus} className="text-foreground size-4" />
					<Text>Invite members</Text>
				</DropdownMenuItem>
				{switchableOrgs.length > 0 ? <DropdownMenuSeparator /> : null}
				{switchableOrgs.map((name) => (
					<DropdownMenuItem key={name} disabled={disabled}>
						<Icon as={ArrowLeftRight} className="text-foreground size-4" />
						<Text numberOfLines={1}>Switch to {name}</Text>
					</DropdownMenuItem>
				))}
				{switchableOrgs.length > 0 ? <DropdownMenuSeparator /> : null}
				<DropdownMenuItem variant="destructive">
					<Icon as={LogOut} className="text-destructive size-4" />
					<Text>Log out</Text>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

const meta: Meta<typeof OrgDropdownPreview> = {
	title: "Components/OrgDropdown",
	component: OrgDropdownPreview,
	parameters: {
		docs: {
			description: {
				component:
					"Authenticated header dropdown — shows active org, Settings, Invite members, switchable orgs, Log out. Real component reads via `authClient.useSession()` + `useLiveQuery(collections.organizations)`; this Storybook surface uses mock data for visual audit. Token-clean (Tailwind classes only; no hardcoded values). Per screens/AUDIT.md.",
			},
		},
	},
	args: {
		activeOrgName: "Superset",
		switchableOrgs: ["Acme Corp", "Vercel"],
		disabled: false,
	},
	argTypes: {
		activeOrgName: { control: "text" },
		disabled: { control: "boolean" },
	},
};

export default meta;

type Story = StoryObj<typeof OrgDropdownPreview>;

export const Default: Story = {};
export const SingleOrgNoSwitch: Story = { args: { switchableOrgs: [] } };
export const ManySwitchableOrgs: Story = {
	args: {
		switchableOrgs: ["Acme Corp", "Vercel", "Initech", "Cyberdyne", "Stark"],
	},
};
export const SwitchingInProgress: Story = { args: { disabled: true } };
export const LongOrgName: Story = {
	args: {
		activeOrgName: "Very Long Organization Name That Truncates",
	},
};
