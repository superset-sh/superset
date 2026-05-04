import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useCallback } from "react";
import type {
	LinkAction,
	LinkTier,
	LinkTierMap,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";

type SlotValue = LinkAction | "none";

const TIER_LABELS: Array<{ key: LinkTier; label: string }> = [
	{ key: "plain", label: "Click" },
	{ key: "meta", label: "⌘-click" },
	{ key: "metaShift", label: "⌘⇧-click" },
];

function toSlot(action: LinkAction | null): SlotValue {
	return action ?? "none";
}

function fromSlot(slot: SlotValue): LinkAction | null {
	return slot === "none" ? null : slot;
}

export interface ActionLabels {
	pane: string;
	external: string;
}

export interface LinkTierMapperProps {
	title: string;
	description: string;
	value: LinkTierMap;
	onChange: (next: LinkTierMap) => void;
	idPrefix: string;
	actionLabels: ActionLabels;
}

export function LinkTierMapper({
	title,
	description,
	value,
	onChange,
	idPrefix,
	actionLabels,
}: LinkTierMapperProps) {
	const pick = useCallback(
		(tier: LinkTier, nextSlot: SlotValue) => {
			const nextAction = fromSlot(nextSlot);
			if (value[tier] === nextAction) return;
			onChange({ ...value, [tier]: nextAction });
		},
		[value, onChange],
	);

	const options: Array<{ value: SlotValue; label: string }> = [
		{ value: "none", label: "Do nothing" },
		{ value: "pane", label: actionLabels.pane },
		{ value: "external", label: actionLabels.external },
	];

	return (
		<div>
			<h3 className="text-sm font-medium mb-1">{title}</h3>
			<p className="text-xs text-muted-foreground mb-3">{description}</p>
			<div className="space-y-2">
				{TIER_LABELS.map(({ key, label }) => {
					const id = `${idPrefix}-${key}`;
					return (
						<div key={key} className="flex items-center justify-between gap-4">
							<Label htmlFor={id} className="text-sm font-medium">
								{label}
							</Label>
							<Select
								value={toSlot(value[key])}
								onValueChange={(v) => pick(key, v as SlotValue)}
							>
								<SelectTrigger id={id} size="sm" className="w-44">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{options.map((opt) => (
										<SelectItem key={opt.value} value={opt.value}>
											{opt.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					);
				})}
			</div>
		</div>
	);
}
