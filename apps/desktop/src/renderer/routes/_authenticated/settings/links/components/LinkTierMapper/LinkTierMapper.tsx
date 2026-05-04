import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useCallback } from "react";
import {
	actionLabel,
	type LinkAction,
	type LinkTier,
	type LinkTierMap,
	modifierLabel,
	type Surface,
} from "renderer/lib/clickPolicy";

type SlotValue = LinkAction | "none";

const TIERS: LinkTier[] = ["plain", "shift", "meta", "metaShift"];
const ACTIONS: LinkAction[] = ["pane", "newTab", "external"];

function toSlot(action: LinkAction | null): SlotValue {
	return action ?? "none";
}

function fromSlot(slot: SlotValue): LinkAction | null {
	return slot === "none" ? null : slot;
}

export interface LinkTierMapperProps {
	title: string;
	description: string;
	value: LinkTierMap;
	onChange: (next: LinkTierMap) => void;
	idPrefix: string;
	surface: Surface;
}

export function LinkTierMapper({
	title,
	description,
	value,
	onChange,
	idPrefix,
	surface,
}: LinkTierMapperProps) {
	const pick = useCallback(
		(tier: LinkTier, nextSlot: SlotValue) => {
			const nextAction = fromSlot(nextSlot);
			if (value[tier] === nextAction) return;
			onChange({ ...value, [tier]: nextAction });
		},
		[value, onChange],
	);

	return (
		<section className="rounded-md border border-border p-5">
			<div className="mb-1 text-sm font-medium">{title}</div>
			<p className="mb-4 text-xs text-muted-foreground">{description}</p>
			<div className="space-y-3">
				{TIERS.map((tier) => {
					const id = `${idPrefix}-${tier}`;
					return (
						<div key={tier} className="flex items-center justify-between">
							<Label htmlFor={id} className="text-sm capitalize">
								{modifierLabel(tier)}
							</Label>
							<Select
								value={toSlot(value[tier])}
								onValueChange={(v) => pick(tier, v as SlotValue)}
							>
								<SelectTrigger id={id} className="w-[200px]">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">Do nothing</SelectItem>
									{ACTIONS.map((action) => (
										<SelectItem key={action} value={action}>
											{actionLabel(action, surface)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					);
				})}
			</div>
		</section>
	);
}
