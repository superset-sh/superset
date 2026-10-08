import { useLingui } from "@lingui/react/macro";
import type { ShareRoleOption } from "@superset/shared/sharing";
import { ChevronRight } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { GeneralAccess } from "../../../types";
import { MoreButton } from "../MoreButton";

export function GeneralAccessRow({
	general,
	roles,
	canManage,
	onOpenWho,
	onOpenLevel,
}: {
	general: GeneralAccess;
	roles: ShareRoleOption[];
	canManage: boolean;
	onOpenWho: () => void;
	onOpenLevel: () => void;
}) {
	const { t } = useLingui();
	const current =
		general.options.find((option) => option.value === general.value) ??
		general.options[0];
	if (!current) return null;
	const role = general.role
		? (roles.find((option) => option.id === general.role?.value) ?? roles[0])
		: undefined;

	return (
		<View className="min-h-14 flex-row items-center gap-3">
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={t({ message: "General access" })}
				disabled={!canManage}
				onPress={onOpenWho}
				className="min-w-0 flex-1 flex-row items-center gap-3 py-2 active:opacity-60"
			>
				<View className="bg-muted size-9 shrink-0 items-center justify-center rounded-lg">
					<Icon as={current.icon} className="text-foreground size-[18px]" />
				</View>
				<View className="min-w-0 flex-1">
					<View className="flex-row items-center gap-1">
						<Text className="shrink text-base" numberOfLines={1}>
							{current.label}
						</Text>
						{canManage ? (
							<Icon
								as={ChevronRight}
								className="text-muted-foreground size-4"
							/>
						) : null}
					</View>
					<Text className="text-muted-foreground text-sm" numberOfLines={2}>
						{role ? role.label : current.description}
					</Text>
				</View>
			</Pressable>
			{role && canManage ? (
				<MoreButton
					a11yLabel={t({ message: "What general access allows" })}
					onPress={onOpenLevel}
				/>
			) : null}
		</View>
	);
}
