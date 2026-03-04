import { BottomSheet, Group, Host, RNHostView } from "@expo/ui/swift-ui";
import {
	background,
	environment,
	presentationDragIndicator,
} from "@expo/ui/swift-ui/modifiers";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/hooks/useTheme";
import { OrganizationAvatar } from "./components/OrganizationAvatar";

export interface Organization {
	id: string;
	name: string;
	slug?: string | null;
	logo?: string | null;
}

export function OrganizationSwitcherSheet({
	isPresented,
	onIsPresentedChange,
	organizations,
	activeOrganizationId,
	onSwitchOrganization,
	width,
}: {
	isPresented: boolean;
	onIsPresentedChange: (value: boolean) => void;
	organizations: Organization[];
	activeOrganizationId?: string | null;
	onSwitchOrganization: (organizationId: string) => void;
	width: number;
}) {
	const theme = useTheme();

	return (
		<Host style={{ position: "absolute", width }}>
			<BottomSheet
				isPresented={isPresented}
				onIsPresentedChange={onIsPresentedChange}
				fitToContents
			>
				<Group
					modifiers={[
						environment("colorScheme", "dark"),
						presentationDragIndicator("visible"),
						background(theme.background),
					]}
				>
					<RNHostView matchContents>
						<View className="px-5 pb-3 pt-6">
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
										onPress={() => onSwitchOrganization(organization.id)}
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
													style={{
														color: theme.mutedForeground,
													}}
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
					</RNHostView>
				</Group>
			</BottomSheet>
		</Host>
	);
}
