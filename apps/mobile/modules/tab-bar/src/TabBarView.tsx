import { Host } from "@expo/ui/swift-ui";
import { requireNativeView } from "expo";
import type { NativeSyntheticEvent } from "react-native";
import type { TabBarViewProps } from "./TabBarView.types";

type NativeTabBarViewProps = Omit<
	TabBarViewProps,
	"onTabSelect" | "onMenuActionPress" | "onExpandedChange" | "style"
> & {
	onTabSelect: (event: NativeSyntheticEvent<{ name: string }>) => void;
	onMenuActionPress: (event: NativeSyntheticEvent<{ name: string }>) => void;
	onExpandedChange: (
		event: NativeSyntheticEvent<{ expanded: boolean }>,
	) => void;
};

const NativeView: React.ComponentType<NativeTabBarViewProps> =
	requireNativeView("TabBar");

export function TabBarView({
	onTabSelect,
	onMenuActionPress,
	onExpandedChange,
	style,
	...props
}: TabBarViewProps) {
	return (
		<Host style={style}>
			<NativeView
				{...props}
				onTabSelect={({
					nativeEvent: { name },
				}: NativeSyntheticEvent<{ name: string }>) => {
					onTabSelect?.(name);
				}}
				onMenuActionPress={({
					nativeEvent: { name },
				}: NativeSyntheticEvent<{ name: string }>) => {
					onMenuActionPress?.(name);
				}}
				onExpandedChange={({
					nativeEvent: { expanded },
				}: NativeSyntheticEvent<{ expanded: boolean }>) => {
					onExpandedChange?.(expanded);
				}}
			/>
		</Host>
	);
}
