import type { DrawerContentComponentProps } from "@react-navigation/drawer";
import { Drawer } from "expo-router/drawer";
import { useDevicePresence } from "@/hooks/useDevicePresence";
import { DrawerContent } from "@/screens/(authenticated)/components/DrawerContent";
import { CollectionsProvider } from "@/screens/(authenticated)/providers/CollectionsProvider";

export default function AuthenticatedLayout() {
	useDevicePresence();

	return (
		<CollectionsProvider>
			<Drawer
				drawerContent={(props: DrawerContentComponentProps) => (
					<DrawerContent {...props} />
				)}
				screenOptions={{ headerShown: false }}
			/>
		</CollectionsProvider>
	);
}
