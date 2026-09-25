import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

/**
 * What fills the terminal area when there is no terminal: no sessions, an
 * offline host, or still resolving.
 *
 * It scrolls even though it never overflows — pulling down is how people ask a
 * screen to try again, and a screen that cannot be pulled reads as stuck when
 * the thing you are waiting for is a host coming back.
 */
export function WorkspacePlaceholder({
	icon,
	title,
	body,
	action,
	refreshing,
	onRefresh,
}: {
	icon?: LucideIcon;
	title: string;
	body?: string;
	action?: ReactNode;
	refreshing: boolean;
	onRefresh: () => void;
}) {
	return (
		<ScrollView
			className="flex-1"
			contentContainerClassName="grow items-center justify-center gap-5 px-10"
			refreshControl={
				<RefreshControl onRefresh={onRefresh} refreshing={refreshing} />
			}
		>
			{icon ? (
				<View className="bg-secondary size-14 items-center justify-center rounded-full">
					<Icon as={icon} className="text-muted-foreground size-6" />
				</View>
			) : null}
			<View className="gap-1.5">
				<Text className="text-center font-semibold text-[17px] tracking-[-0.2px]">
					{title}
				</Text>
				{body ? (
					<Text className="text-muted-foreground text-center text-[15px] leading-[21px]">
						{body}
					</Text>
				) : null}
			</View>
			{action}
		</ScrollView>
	);
}
