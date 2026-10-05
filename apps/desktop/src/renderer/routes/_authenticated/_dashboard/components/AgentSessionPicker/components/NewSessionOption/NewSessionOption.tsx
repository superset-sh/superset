import { LuPlus } from "react-icons/lu";
import { usePresetIcon } from "renderer/assets/app-icons/preset-icons";

export function NewSessionOption({
	label,
	presetId,
}: {
	label: string;
	presetId: string;
}) {
	const iconSrc = usePresetIcon(presetId);
	return (
		<span className="inline-flex min-w-0 items-center gap-2">
			{iconSrc ? (
				<img
					src={iconSrc}
					alt=""
					className="size-3.5 shrink-0"
					draggable={false}
				/>
			) : (
				<LuPlus className="size-3.5 shrink-0 text-muted-foreground" />
			)}
			<span className="truncate">{label}</span>
		</span>
	);
}
