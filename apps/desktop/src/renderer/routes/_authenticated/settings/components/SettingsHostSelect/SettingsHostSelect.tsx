import { useSettingsHost } from "../../hooks/useSettingsHost";
import { HostSelect } from "../HostSelect";

interface SettingsHostSelectProps {
	align?: "start" | "end";
	className?: string;
}

export function SettingsHostSelect({
	align,
	className,
}: SettingsHostSelectProps) {
	const { hostId, hostOptions, hasMultipleHosts, selectHost } =
		useSettingsHost();
	if (!hasMultipleHosts || !hostId) return null;
	return (
		<HostSelect
			value={hostId}
			options={hostOptions}
			onValueChange={selectHost}
			align={align}
			className={className}
		/>
	);
}
