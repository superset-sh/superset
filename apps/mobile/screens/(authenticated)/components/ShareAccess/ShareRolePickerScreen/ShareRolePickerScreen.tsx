import { useLingui } from "@lingui/react/macro";
import { type ShareRoleOption, stagedKey } from "@superset/shared/sharing";
import * as Haptics from "expo-haptics";
import { Stack, useRouter } from "expo-router";
import { Trash2 } from "lucide-react-native";
import { ScrollView } from "react-native";
import { Icon } from "@/components/ui/icon";
import { ListRow } from "../../ListRow";
import { ListRowCheck } from "../../ListRowCheck";
import { useShareInviteStore } from "../stores/shareInviteStore";

/** One selected person's permission level on the invite screen, or taking them back off it. */
export function ShareRolePickerScreen({ roles }: { roles: ShareRoleOption[] }) {
	const { t } = useLingui();
	const router = useRouter();
	const editing = useShareInviteStore((state) => state.editing);
	const pick = useShareInviteStore((state) =>
		state.staged.find((p) => stagedKey(p) === state.editing),
	);
	const role = useShareInviteStore((state) =>
		state.editing ? state.roles[state.editing] : undefined,
	);
	const setRole = useShareInviteStore((state) => state.setRole);
	const unstage = useShareInviteStore((state) => state.unstage);

	const label = !pick
		? ""
		: pick.kind === "user"
			? pick.person.name
			: pick.kind === "team"
				? pick.team.name
				: pick.email;

	return (
		<>
			<Stack.Screen options={{ title: label }} />
			<ScrollView
				className="bg-background flex-1"
				contentInsetAdjustmentBehavior="automatic"
				contentContainerClassName="px-4 pb-10 pt-2"
			>
				{roles.map((option) => (
					<ListRow
						key={option.id}
						label={option.label}
						subtitle={option.description}
						trailing={<ListRowCheck visible={option.id === role} />}
						onPress={() => {
							if (!editing) return;
							void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
							setRole(editing, option.id);
							router.back();
						}}
					/>
				))}
				<ListRow
					icon={<Icon as={Trash2} className="text-destructive size-[18px]" />}
					label={t({ message: "Remove" })}
					destructive
					isLast
					onPress={() => {
						if (!editing) return;
						void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
						unstage(editing);
						router.back();
					}}
				/>
			</ScrollView>
		</>
	);
}
