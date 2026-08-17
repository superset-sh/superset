import { View } from "react-native";
import { HostStatusDot } from "@/screens/(authenticated)/components/HostStatusDot";
import { Chip } from "./components/Chip";

interface ScopeBarProps {
	hostName: string | null;
	hostOnline: boolean;
	sortLabel: string;
	onPressHost: () => void;
	onPressSort: () => void;
}

/**
 * Names the scope the list is actually under. The host and sort were only ever
 * legible from inside the filter sheet, which is why a cold start never told
 * you which machine you were looking at. It holds during search too, because
 * search is scoped to the same host — matches elsewhere are offered as a tail
 * rather than silently mixed in.
 */
export function ScopeBar({
	hostName,
	hostOnline,
	sortLabel,
	onPressHost,
	onPressSort,
}: ScopeBarProps) {
	return (
		<View className="flex-row items-center gap-2 px-4 pb-2 pt-1">
			{hostName ? (
				<Chip
					label={hostName}
					leading={<HostStatusDot isOnline={hostOnline} />}
					onPress={onPressHost}
				/>
			) : null}
			<Chip label={sortLabel} onPress={onPressSort} />
		</View>
	);
}
