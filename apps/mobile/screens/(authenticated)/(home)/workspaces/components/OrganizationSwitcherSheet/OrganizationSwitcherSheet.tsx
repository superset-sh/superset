import { BottomSheet, Host, RNHostView } from "@expo/ui/swift-ui";
import { Check } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { OrganizationAvatar } from "./components/OrganizationAvatar";

type Organization = {
	id: string;
	name: string;
	slug?: string | null;
	logo?: string | null;
};

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
	return (
		<Host style={{ position: "absolute", width }}>
			<BottomSheet
				isPresented={isPresented}
				onIsPresentedChange={onIsPresentedChange}
				fitToContents
			>
				<RNHostView matchContents>
					<View className="px-6 pb-8 pt-4">
						<Text className="mb-3 text-[13px] font-medium uppercase tracking-widest text-black/40">
							Workspaces
						</Text>
						{organizations.map((organization) => {
							const isActive = organization.id === activeOrganizationId;
							return (
								<Pressable
									key={organization.id}
									onPress={() => onSwitchOrganization(organization.id)}
									className="flex-row items-center gap-3 py-3"
								>
									<OrganizationAvatar
										name={organization.name}
										logo={organization.logo}
										size={40}
									/>
									<View className="flex-1">
										<Text className="text-base font-medium text-black">
											{organization.name}
										</Text>
										{organization.slug ? (
											<Text className="text-sm text-black/40">
												superset.sh/{organization.slug}
											</Text>
										) : null}
									</View>
									{isActive ? <Check size={20} color="#3b82f6" /> : null}
								</Pressable>
							);
						})}
					</View>
				</RNHostView>
			</BottomSheet>
		</Host>
	);
}
