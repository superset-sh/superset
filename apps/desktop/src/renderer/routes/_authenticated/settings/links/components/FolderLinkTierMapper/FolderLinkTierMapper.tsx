import { Trans } from "@lingui/react/macro";
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
	type FolderLinkAction,
	type FolderTierMap,
	folderIntentLabel,
	type LinkTier,
	modifierLabel,
} from "renderer/lib/clickPolicy";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

type SlotValue = FolderLinkAction | "none";

const TIERS: LinkTier[] = ["plain", "shift", "meta", "metaShift"];
const ACTIONS: FolderLinkAction[] = ["reveal", "external", "finder"];

function toSlot(action: FolderLinkAction | null): SlotValue {
	return action ?? "none";
}

function fromSlot(slot: SlotValue): FolderLinkAction | null {
	return slot === "none" ? null : slot;
}

export interface FolderLinkTierMapperProps {
	title: string;
	description: string;
	value: FolderTierMap;
	onChange: (next: FolderTierMap) => void;
	idPrefix: string;
}

/**
 * LinkTierMapper's folder sibling — folders have their own action set
 * (reveal / editor / Finder instead of pane / newTab / external), so the
 * generic file/url mapper's LinkAction typing doesn't fit.
 */
export function FolderLinkTierMapper({
	title,
	description,
	value,
	onChange,
	idPrefix,
}: FolderLinkTierMapperProps) {
	const searchQuery = useSettingsSearchQuery();
	const pick = useCallback(
		(tier: LinkTier, nextSlot: SlotValue) => {
			const nextAction = fromSlot(nextSlot);
			if (value[tier] === nextAction) return;
			onChange({ ...value, [tier]: nextAction });
		},
		[value, onChange],
	);

	return (
		<div>
			<h3 className="text-sm font-medium mb-1">
				<HighlightText text={title} query={searchQuery} />
			</h3>
			<p className="text-xs text-muted-foreground mb-3">
				<HighlightText text={description} query={searchQuery} />
			</p>
			<div className="space-y-2">
				{TIERS.map((tier) => {
					const id = `${idPrefix}-${tier}`;
					return (
						<div key={tier} className="flex items-center justify-between gap-4">
							<Label htmlFor={id} className="text-sm font-medium capitalize">
								{modifierLabel(tier)}
							</Label>
							<Select
								value={toSlot(value[tier])}
								onValueChange={(v) => pick(tier, v as SlotValue)}
							>
								<SelectTrigger id={id} size="sm" className="w-44">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">
										<Trans>Do nothing</Trans>
									</SelectItem>
									{ACTIONS.map((action) => (
										<SelectItem key={action} value={action}>
											{folderIntentLabel(action)}
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
