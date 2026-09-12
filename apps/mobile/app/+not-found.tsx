import { Trans, useLingui } from "@lingui/react/macro";
import { router, Stack, usePathname } from "expo-router";
import { Compass } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

/**
 * Ours, so a bad link never lands on expo-router's development page — that one
 * offers a Sitemap, which is a debugging tool rather than something to hand a
 * person who tapped the wrong thing.
 *
 * Home rather than back: arriving here from a deep link means there is nothing
 * behind us, and a back button that does nothing is worse than none.
 */
export default function NotFoundScreen() {
	const { t } = useLingui();
	const pathname = usePathname();
	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<View className="bg-background flex-1 items-center justify-center gap-6 px-10">
				<View className="bg-secondary size-16 items-center justify-center rounded-full">
					<Icon as={Compass} className="text-muted-foreground size-7" />
				</View>
				<View className="gap-2">
					<Text className="text-center font-semibold text-[20px] tracking-[-0.2px]">
						<Trans>This screen doesn't exist</Trans>
					</Text>
					<Text className="text-muted-foreground text-center text-[15px] leading-[21px]">
						{pathname && pathname !== "/"
							? t({
									message: `Nothing lives at ${pathname}.`,
								})
							: t({
									message: "That link doesn't lead anywhere in the app.",
								})}
					</Text>
				</View>
				<Pressable
					accessibilityRole="button"
					className="bg-secondary h-[42px] items-center justify-center rounded-md px-6 active:opacity-80"
					onPress={() => router.replace("/")}
				>
					<Text className="font-medium text-[15px]">
						<Trans>Go home</Trans>
					</Text>
				</Pressable>
			</View>
		</>
	);
}
