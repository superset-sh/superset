import { useLingui } from "@lingui/react/macro";
import { getInitials } from "@superset/shared/names";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Text } from "@/components/ui/text";

const SHOWN = 4;

interface PresenceAvatarsProps {
	people: { id: string; name: string; image: string | null; color: string }[];
}

export function PresenceAvatars({ people }: PresenceAvatarsProps) {
	const { t } = useLingui();
	const insets = useSafeAreaInsets();
	const hidden = people.length - SHOWN;

	return (
		<View
			accessible
			accessibilityLabel={people.map((person) => person.name).join(", ")}
			accessibilityHint={t({ message: "Also viewing this page" })}
			className="bg-popover border-border absolute right-3 flex-row items-center rounded-full border p-1 shadow-md"
			style={{ bottom: insets.bottom + 12 }}
		>
			{people.slice(0, SHOWN).map((person, index) => (
				<Avatar
					key={person.id}
					alt={person.name}
					className="border-popover size-7 border-2"
					style={{ marginLeft: index > 0 ? -8 : 0 }}
				>
					{person.image ? <AvatarImage source={{ uri: person.image }} /> : null}
					<AvatarFallback style={{ backgroundColor: person.color }}>
						<Text className="font-medium text-[10px] text-white">
							{getInitials(person.name) || "?"}
						</Text>
					</AvatarFallback>
				</Avatar>
			))}
			{hidden > 0 ? (
				<Text className="text-muted-foreground px-1.5 text-xs tabular-nums">
					+{hidden}
				</Text>
			) : null}
		</View>
	);
}
