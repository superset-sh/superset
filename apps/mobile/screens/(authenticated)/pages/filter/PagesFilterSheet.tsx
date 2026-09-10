import { useLingui } from "@lingui/react/macro";
import * as Haptics from "expo-haptics";
import { Stack, useRouter } from "expo-router";
import { Check, Globe, Layers, Lock } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import {
	type PageScope,
	usePagesFilterStore,
} from "../stores/pagesFilterStore";

export function PagesFilterSheet() {
	const { t } = useLingui();
	const router = useRouter();
	const scope = usePagesFilterStore((state) => state.scope);
	const setScope = usePagesFilterStore((state) => state.setScope);

	const options: Array<{
		value: PageScope;
		label: string;
		icon: typeof Globe;
	}> = [
		{ value: "all", label: t({ message: "All" }), icon: Layers },
		{ value: "team", label: t({ message: "Team" }), icon: Globe },
		{ value: "mine", label: t({ message: "Just me" }), icon: Lock },
	];

	return (
		<>
			<Stack.Toolbar placement="left">
				<Stack.Toolbar.Button
					accessibilityLabel={t({ message: "Close" })}
					icon="xmark"
					onPress={() => router.back()}
				/>
			</Stack.Toolbar>

			<ScrollView
				className="bg-background flex-1"
				contentInsetAdjustmentBehavior="automatic"
				contentContainerClassName="px-4 pb-10 pt-1"
			>
				{options.map((option) => (
					<Pressable
						key={option.value}
						accessibilityRole="button"
						accessibilityState={{ selected: scope === option.value }}
						onPress={() => {
							void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							setScope(option.value);
							router.back();
						}}
						className="min-h-11 flex-row items-center gap-2.5 py-2.5 active:opacity-60"
					>
						<Icon
							as={option.icon}
							className="text-muted-foreground size-4 shrink-0"
						/>
						<View className="flex-1">
							<Text className="text-[15px]">{option.label}</Text>
						</View>
						{scope === option.value ? (
							<Icon as={Check} className="text-primary size-4" />
						) : null}
					</Pressable>
				))}
			</ScrollView>
		</>
	);
}
