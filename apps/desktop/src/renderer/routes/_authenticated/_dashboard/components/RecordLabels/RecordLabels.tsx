import { Trans, useLingui } from "@lingui/react/macro";
import { Popover, PopoverAnchor, PopoverContent } from "@superset/ui/popover";
import { useState } from "react";
import { LuPlus } from "react-icons/lu";
import { LabelCommand } from "renderer/routes/_authenticated/_dashboard/components/LabelCommand";
import { RecordLabelChip } from "./components/RecordLabelChip";
import type { RecordLabel } from "./types";

interface RecordLabelsProps {
	labels: RecordLabel[];
	knownLabels: RecordLabel[];
	onAddLabel: (name: string) => void;
	onRemoveLabel: (labelId: string) => void;
}

export function RecordLabels({
	labels,
	knownLabels,
	onAddLabel,
	onRemoveLabel,
}: RecordLabelsProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);

	const openMenu = () => setOpen(true);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverAnchor asChild>
				<div className="flex flex-wrap items-center gap-1.5">
					{labels.map((label) => (
						<RecordLabelChip key={label.id} label={label} onClick={openMenu} />
					))}
					{labels.length > 0 ? (
						<button
							type="button"
							onClick={openMenu}
							aria-label={t({ message: "Add label" })}
							className="inline-flex size-5 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground hover:border-muted-foreground/60 hover:text-foreground"
						>
							<LuPlus className="size-3" />
						</button>
					) : (
						<button
							type="button"
							onClick={openMenu}
							className="-mx-1 inline-flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-left hover:bg-fill-hover focus-visible:bg-fill-hover focus-visible:outline-none"
						>
							<LuPlus className="size-3.5 text-muted-foreground" />
							<Trans>Add label</Trans>
						</button>
					)}
				</div>
			</PopoverAnchor>
			<PopoverContent align="start" className="w-64 p-0">
				<LabelCommand
					labels={labels}
					knownLabels={knownLabels}
					onAdd={onAddLabel}
					onRemove={onRemoveLabel}
				/>
			</PopoverContent>
		</Popover>
	);
}
