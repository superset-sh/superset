import { useLingui } from "@lingui/react/macro";
import {
	TbArrowsMaximize,
	TbArrowsMinimize,
	TbLayoutSidebarRight,
	TbLogs,
} from "react-icons/tb";
import { DeviceControlButton } from "../DeviceControlButton";
import { FloatingBar } from "../FloatingBar";

interface DeviceActionsProps {
	expanded: boolean;
	onToggleExpanded: () => void;
	onToggleTools: () => void;
	onToggleLogs: () => void;
}

export function DeviceActions({
	expanded,
	onToggleExpanded,
	onToggleTools,
	onToggleLogs,
}: DeviceActionsProps) {
	const { t } = useLingui();

	return (
		<FloatingBar className="top-3 right-3">
			<DeviceControlButton
				label={
					expanded
						? t({ message: "Exit full screen" })
						: t({ message: "Full screen" })
				}
				onClick={onToggleExpanded}
			>
				{expanded ? (
					<TbArrowsMinimize className="size-4" />
				) : (
					<TbArrowsMaximize className="size-4" />
				)}
			</DeviceControlButton>
			{!expanded && (
				<>
					<DeviceControlButton
						label={t({ message: "Tools" })}
						onClick={onToggleTools}
					>
						<TbLayoutSidebarRight className="size-4" />
					</DeviceControlButton>
					<DeviceControlButton
						label={t({ message: "Logs" })}
						onClick={onToggleLogs}
					>
						<TbLogs className="size-4" />
					</DeviceControlButton>
				</>
			)}
		</FloatingBar>
	);
}
