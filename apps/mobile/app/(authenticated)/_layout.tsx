import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useDevicePresence } from "@/hooks/useDevicePresence";
import { CollectionsProvider } from "@/screens/(authenticated)/providers/CollectionsProvider";

export default function AuthenticatedLayout() {
	useDevicePresence();

	return (
		<CollectionsProvider>
			<NativeTabs>
				<NativeTabs.Trigger name="(home)">
					<NativeTabs.Trigger.Icon
						sf={{ default: "house", selected: "house.fill" }}
					/>
					<NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
				</NativeTabs.Trigger>
				<NativeTabs.Trigger name="(tasks)">
					<NativeTabs.Trigger.Icon
						sf={{
							default: "checkmark.square",
							selected: "checkmark.square.fill",
						}}
					/>
					<NativeTabs.Trigger.Label>Tasks</NativeTabs.Trigger.Label>
				</NativeTabs.Trigger>
				<NativeTabs.Trigger name="(more)">
					<NativeTabs.Trigger.Icon sf="ellipsis" />
					<NativeTabs.Trigger.Label>More</NativeTabs.Trigger.Label>
				</NativeTabs.Trigger>
			</NativeTabs>
		</CollectionsProvider>
	);
}
