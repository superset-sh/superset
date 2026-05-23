import Ionicons from "@expo/vector-icons/Ionicons";
import type { Meta, StoryObj } from "@storybook/react-native";
import { Platform, Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { OrganizationAvatar } from "./components/OrganizationAvatar";
import { OrganizationSwitcherSheet } from "./OrganizationSwitcherSheet";

const MOCK_ORGS = [
	{
		id: "org_1",
		name: "Superset",
		slug: "superset",
		logo: null,
	},
	{
		id: "org_2",
		name: "Acme Corp",
		slug: "acme",
		logo: null,
	},
	{
		id: "org_3",
		name: "Vercel",
		slug: "vercel",
		logo: "https://logo.clearbit.com/vercel.com",
	},
];

/**
 * The real `OrganizationSwitcherSheet` uses `@expo/ui/swift-ui` — an iOS-only
 * SwiftUI bridge that does not render on Android Emulator inside Storybook.
 *
 * On iOS, the actual sheet appears as a native bottom sheet over the rest of
 * the UI. On Android (and in static previews), this story renders the *inner
 * content layout* of the sheet using the same tokens.
 */
function OrganizationSwitcherSheetInner({
	organizations,
	activeOrganizationId,
}: {
	organizations: typeof MOCK_ORGS;
	activeOrganizationId: string;
}) {
	const theme = useTheme();
	return (
		<View className="bg-background border-border rounded-lg border p-5">
			<Text
				className="mb-2 text-sm font-semibold"
				style={{ color: theme.mutedForeground }}
			>
				Organizations
			</Text>
			{organizations.map((organization) => {
				const isActive = organization.id === activeOrganizationId;
				return (
					<Pressable
						key={organization.id}
						className="flex-row items-center gap-2.5 py-2.5"
					>
						<OrganizationAvatar
							name={organization.name}
							logo={organization.logo}
							size={32}
						/>
						<View className="flex-1">
							<Text
								className="text-sm font-medium"
								style={{ color: theme.foreground }}
							>
								{organization.name}
							</Text>
							{organization.slug ? (
								<Text
									className="text-xs"
									style={{ color: theme.mutedForeground }}
								>
									superset.sh/{organization.slug}
								</Text>
							) : null}
						</View>
						{isActive ? (
							<Ionicons
								name="checkmark-circle"
								size={18}
								color={theme.primary}
							/>
						) : null}
					</Pressable>
				);
			})}
		</View>
	);
}

const meta: Meta<typeof OrganizationSwitcherSheetInner> = {
	title: "Components/OrganizationSwitcherSheet",
	component: OrganizationSwitcherSheetInner,
	parameters: {
		docs: {
			description: {
				component:
					"Bottom sheet for switching organizations. **iOS-only in production** — uses `@expo/ui/swift-ui` (Host/BottomSheet/Group/RNHostView). Inner layout shown here in Storybook; real sheet appears as a native SwiftUI bottom sheet over the app. The sheet forces `colorScheme: dark` (documented exception in screens/AUDIT.md).",
			},
		},
	},
	args: {
		organizations: MOCK_ORGS,
		activeOrganizationId: "org_1",
	},
	argTypes: {
		activeOrganizationId: {
			control: { type: "select" },
			options: MOCK_ORGS.map((o) => o.id),
		},
	},
};

export default meta;

type Story = StoryObj<typeof OrganizationSwitcherSheetInner>;

export const ThreeOrgs: Story = {};
export const SuperLongList: Story = {
	args: {
		organizations: [
			...MOCK_ORGS,
			{ id: "org_4", name: "Initech", slug: "initech", logo: null },
			{ id: "org_5", name: "Cyberdyne", slug: "cyberdyne", logo: null },
			{ id: "org_6", name: "Stark Industries", slug: "stark", logo: null },
			{ id: "org_7", name: "Wayne Enterprises", slug: "wayne", logo: null },
		],
	},
};
export const Active2nd: Story = { args: { activeOrganizationId: "org_2" } };

/**
 * Real-component story — only renders meaningfully on iOS. Renders nothing on
 * Android/web; use the InnerLayout stories above for visual inspection.
 */
export const NativeSheet: Story = {
	render: () => {
		if (Platform.OS !== "ios") {
			return (
				<View className="bg-muted rounded-md p-4">
					<Text variant="muted" className="text-xs">
						iOS-only — switch to iOS Simulator to render the real SwiftUI
						BottomSheet.
					</Text>
				</View>
			);
		}
		return (
			<OrganizationSwitcherSheet
				isPresented={true}
				onIsPresentedChange={() => undefined}
				organizations={MOCK_ORGS}
				activeOrganizationId="org_1"
				onSwitchOrganization={() => undefined}
				width={390}
			/>
		);
	},
};
