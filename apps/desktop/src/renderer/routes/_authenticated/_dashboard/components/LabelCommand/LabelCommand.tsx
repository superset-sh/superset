import { Trans, useLingui } from "@lingui/react/macro";
import {
	LABELS_MAX_PER_WORKSPACE,
	normalizeLabelName,
} from "@superset/shared/labels";
import { Checkbox } from "@superset/ui/checkbox";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@superset/ui/command";
import { type KeyboardEvent, useState } from "react";
import { LuPlus } from "react-icons/lu";
import { CloudWorkspaceLabelDot } from "renderer/routes/_authenticated/_dashboard/components/CloudWorkspaceLabelDot";

interface Label {
	id: string;
	name: string;
	color: string | null;
}

interface LabelCommandProps {
	labels: Label[];
	knownLabels: Label[];
	onAdd: (name: string) => void;
	onRemove: (labelId: string) => void;
	onKeyDown?: (event: KeyboardEvent) => void;
}

export function LabelCommand({
	labels,
	knownLabels,
	onAdd,
	onRemove,
	onKeyDown,
}: LabelCommandProps) {
	const { t } = useLingui();
	const [query, setQuery] = useState("");
	const applied = new Map(labels.map((label) => [label.name, label]));
	const others = knownLabels.filter((label) => !applied.has(label.name));
	const atLimit = labels.length >= LABELS_MAX_PER_WORKSPACE;
	const newLabel = normalizeLabelName(query);
	const canCreate =
		!atLimit &&
		newLabel !== null &&
		!applied.has(newLabel) &&
		!knownLabels.some((label) => label.name === newLabel);

	const toggle = (name: string) => {
		const appliedLabel = applied.get(name);
		if (appliedLabel) onRemove(appliedLabel.id);
		else if (!atLimit) onAdd(name);
		setQuery("");
	};

	return (
		<Command onKeyDown={onKeyDown}>
			<CommandInput
				autoFocus
				value={query}
				onValueChange={setQuery}
				placeholder={t({ message: "Change or add labels…" })}
			/>
			<CommandList>
				<CommandEmpty>
					<Trans>No labels</Trans>
				</CommandEmpty>
				{labels.length > 0 && (
					<CommandGroup>
						{labels.map((label) => (
							<CommandItem
								key={label.id}
								value={label.name}
								disabled={label.id.startsWith("pending:")}
								onSelect={() => toggle(label.name)}
							>
								<Checkbox checked className="pointer-events-none" />
								<CloudWorkspaceLabelDot color={label.color} />
								{label.name}
							</CommandItem>
						))}
					</CommandGroup>
				)}
				{labels.length > 0 && others.length > 0 && <CommandSeparator />}
				{others.length > 0 && (
					<CommandGroup>
						{others.map((label) => (
							<CommandItem
								key={label.id}
								value={label.name}
								disabled={atLimit}
								onSelect={() => toggle(label.name)}
							>
								<Checkbox checked={false} className="pointer-events-none" />
								<CloudWorkspaceLabelDot color={label.color} />
								{label.name}
							</CommandItem>
						))}
					</CommandGroup>
				)}
				{canCreate && newLabel && (
					<CommandGroup>
						<CommandItem
							value={`create:${newLabel}`}
							onSelect={() => toggle(newLabel)}
						>
							<LuPlus className="size-3.5" />
							<Trans>Create "{newLabel}"</Trans>
						</CommandItem>
					</CommandGroup>
				)}
			</CommandList>
		</Command>
	);
}
