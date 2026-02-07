import { GlassView } from "expo-glass-effect";
import { Stack } from "expo-router";
import { ChevronsUpDown } from "lucide-react-native";
import { Image, Pressable } from "react-native";
import { Text } from "@/components/ui/text";

export function OrganizationHeaderButton({
	name,
	logo,
	onPress,
}: {
	name?: string;
	logo?: string | null;
	onPress: () => void;
}) {
	return (
		<>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.View hidesSharedBackground>
					<Pressable onPress={onPress} className="flex-row items-center gap-2">
						{logo ? (
							<GlassView
								style={{
									width: 28,
									height: 28,
									borderRadius: 8,
									overflow: "hidden",
								}}
								colorScheme="dark"
							>
								<Image source={{ uri: logo }} className="size-7" />
							</GlassView>
						) : null}
						<Text className="text-xl font-semibold text-foreground">
							{name ?? "Organization"}
						</Text>
						<ChevronsUpDown size={14} color="hsl(240 5% 64.9%)" />
					</Pressable>
				</Stack.Toolbar.View>
			</Stack.Toolbar>
			<Stack.Toolbar placement="right">
				<Stack.Toolbar.Button icon="square.and.pencil" onPress={() => {}} />
			</Stack.Toolbar>
		</>
	);
}
