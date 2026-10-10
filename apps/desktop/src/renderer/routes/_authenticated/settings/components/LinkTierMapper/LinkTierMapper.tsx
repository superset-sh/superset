import { Trans } from "@lingui/react/macro";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useCallback } from "react";
import {
	actionLabel,
	type LinkAction,
	type LinkTier,
	type LinkTierMap,
	modifierLabel,
	type Surface,
} from "renderer/lib/clickPolicy";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

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
	const searchQuery = useSettingsSearchQuery();
	const isRightPaneAreaEnabled =
		useFeatureFlagEnabled(FEATURE_FLAGS.RIGHT_PANE_AREA) === true;
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
			<div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
				{TIERS.map((tier) => {
					const id = `${idPrefix}-${tier}`;
					const actions: LinkAction[] =
						surface === "url" &&
						(isRightPaneAreaEnabled || value[tier] === "rightPane")
							? [...ACTIONS, "rightPane"]
							: ACTIONS;
					return (
						<div
							key={tier}
							className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 hover:bg-muted/30 transition-colors"
						>
							<Label htmlFor={id} className="text-sm font-medium capitalize">
								{modifierLabel(tier)}
							</Label>
							<Select
								value={toSlot(value[tier])}
								onValueChange={(v) => pick(tier, v as SlotValue)}
							>
								<SelectTrigger
									id={id}
									size="sm"
									className="w-60 max-w-full shrink-0"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">
										<Trans>Do nothing</Trans>
									</SelectItem>
									{actions.map((action) => (
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
		</div>
	);
}
