import { Button } from "@expo/ui/swift-ui";
import { useLingui } from "@lingui/react/macro";
import { formatDate } from "@superset/i18n/format";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { ValueMenu } from "@/screens/(authenticated)/components/ShareAccess";
import type { PageVersion } from "../../../hooks/usePageSharing";

export function SharedVersionRow({
	sharedVersion,
	latestVersion,
	versions,
	canManage,
	onChange,
}: {
	sharedVersion: number | null;
	latestVersion: number | null;
	versions: PageVersion[];
	canManage: boolean;
	onChange: (version: number | null) => void;
}) {
	const { t } = useLingui();
	const latestLabel =
		latestVersion === null
			? t({ message: "Latest" })
			: t({ message: `Latest (v${latestVersion})` });
	const label =
		sharedVersion === null
			? latestLabel
			: t({ message: `Version ${sharedVersion}` });

	return (
		<View className="min-h-14 flex-row items-center gap-3 py-2">
			<View className="min-w-0 flex-1">
				<Text className="text-base">{t({ message: "Shared version" })}</Text>
				<Text className="text-muted-foreground text-sm" numberOfLines={2}>
					{sharedVersion === null
						? t({ message: "Everyone sees new versions as they are published" })
						: t({
								message: `Everyone stays on v${sharedVersion} until you change this`,
							})}
				</Text>
			</View>
			{canManage ? (
				<ValueMenu label={label} a11yLabel={t({ message: "Shared version" })}>
					<Button
						label={latestLabel}
						systemImage={sharedVersion === null ? "checkmark" : undefined}
						onPress={() => onChange(null)}
					/>
					{versions
						.filter((entry) => entry.version !== latestVersion)
						.map((entry) => (
							<Button
								key={entry.version}
								label={`${t({ message: `Version ${entry.version}` })} · ${entry.label ?? formatDate(entry.createdAt)}`}
								systemImage={
									sharedVersion === entry.version ? "checkmark" : undefined
								}
								onPress={() => onChange(entry.version)}
							/>
						))}
				</ValueMenu>
			) : (
				<Text className="text-muted-foreground shrink-0 text-xs">{label}</Text>
			)}
		</View>
	);
}
