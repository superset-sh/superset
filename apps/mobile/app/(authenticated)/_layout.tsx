import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useDevicePresence } from "@/hooks/useDevicePresence";
import { THEME } from "@/lib/theme";
import { CollectionsProvider } from "@/screens/(authenticated)/providers/CollectionsProvider";

export default function AuthenticatedLayout() {
	useDevicePresence();

	return (
		<CollectionsProvider>
			<NativeTabs
				tintColor={THEME.dark.primary}
				blurEffect="systemThinMaterialDark"
			>
				<NativeTabs.Trigger name="(home)">
					<NativeTabs.Trigger.Icon
						src={
							<NativeTabs.Trigger.VectorIcon
								family={FontAwesome6}
								name="house"
							/>
						}
					/>
					<NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
				</NativeTabs.Trigger>
				<NativeTabs.Trigger name="(tasks)">
					<NativeTabs.Trigger.Icon
						src={
							<NativeTabs.Trigger.VectorIcon
								family={FontAwesome6}
								name="square-check"
							/>
						}
					/>
					<NativeTabs.Trigger.Label>Tasks</NativeTabs.Trigger.Label>
				</NativeTabs.Trigger>
				<NativeTabs.Trigger name="(more)">
					<NativeTabs.Trigger.Icon
						src={
							<NativeTabs.Trigger.VectorIcon
								family={FontAwesome6}
								name="ellipsis"
							/>
						}
					/>
					<NativeTabs.Trigger.Label>More</NativeTabs.Trigger.Label>
				</NativeTabs.Trigger>
			</NativeTabs>
		</CollectionsProvider>
	);
}
