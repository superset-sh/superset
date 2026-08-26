import { Cloud } from "lucide-react-native";
import { View } from "react-native";
import { Icon } from "@/components/ui/icon";
import type { WorkspaceScope } from "@/screens/(authenticated)/(home)/home/stores/workspacesFilterStore";
import { HostStatusDot } from "@/screens/(authenticated)/components/HostStatusDot";
import { Chip } from "./components/Chip";

interface ScopeBarProps {
	scope: WorkspaceScope;
	hostName: string | null;
	hostOnline: boolean;
	sortLabel: string;
	onPressScope: () => void;
	onPressSort: () => void;
}

/**
 * Names the scope the list is actually under. The host and sort were only ever
 * legible from inside the filter sheet, which is why a cold start never told
 * you which machine you were looking at. It holds during search too, because
 * search is scoped to the same place — matches elsewhere are offered as a tail
 * rather than silently mixed in.
 *
 * Cloud gets the cloud glyph rather than a status dot: a sandbox isn't a
 * machine of yours that can be asleep, and dressing it as one invites the
 * question of which computer it is.
 */
export function ScopeBar({
	scope,
	hostName,
	hostOnline,
	sortLabel,
	onPressScope,
	onPressSort,
}: ScopeBarProps) {
	const cloud = scope === "cloud";
	return (
		<View className="flex-row items-center gap-2 px-4 pb-2 pt-1">
			{cloud || hostName ? (
				<Chip
					label={cloud ? "Cloud" : (hostName ?? "")}
					leading={
						cloud ? (
							<Icon
								as={Cloud}
								className="text-muted-foreground size-3.5"
								strokeWidth={2}
							/>
						) : (
							<HostStatusDot isOnline={hostOnline} />
						)
					}
					onPress={onPressScope}
				/>
			) : null}
			<Chip label={sortLabel} onPress={onPressSort} />
		</View>
	);
}
