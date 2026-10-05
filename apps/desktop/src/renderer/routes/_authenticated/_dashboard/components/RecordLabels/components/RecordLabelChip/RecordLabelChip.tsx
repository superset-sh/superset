import { CloudWorkspaceLabelDot } from "renderer/routes/_authenticated/_dashboard/components/CloudWorkspaceLabelDot";
import type { RecordLabel } from "../../types";

interface RecordLabelChipProps {
	label: RecordLabel;
	onClick: () => void;
}

export function RecordLabelChip({ label, onClick }: RecordLabelChipProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="inline-flex h-5 items-center gap-1.5 rounded-full border border-border px-[7px] text-[11px] whitespace-nowrap text-muted-foreground hover:border-muted-foreground/60 hover:text-foreground"
		>
			<CloudWorkspaceLabelDot color={label.color} />
			{label.name}
		</button>
	);
}
