import { Trans, useLingui } from "@lingui/react/macro";
import { Checkbox } from "@superset/ui/checkbox";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { Textarea } from "@superset/ui/textarea";
import { VscLoading } from "react-icons/vsc";
import type { ShipActions } from "../../hooks/useShipActions";

interface CreatePrFormProps {
	actions: ShipActions;
}

export function CreatePrForm({ actions }: CreatePrFormProps) {
	const { t } = useLingui();

	return (
		<div className="flex flex-col gap-2">
			<Input
				autoFocus
				value={actions.prTitle}
				onChange={(e) => actions.editPrTitle(e.target.value)}
				placeholder={t({
					message: "Pull request title",
				})}
				className="h-8 text-xs"
			/>
			<Textarea
				value={actions.prBody}
				onChange={(e) => actions.setPrBody(e.target.value)}
				placeholder={t({
					message: "Description (optional)",
				})}
				className="min-h-20 text-xs"
			/>
			<div className="flex items-center justify-between">
				<Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<Checkbox
						checked={actions.prDraft}
						onCheckedChange={(v) => actions.setPrDraft(v === true)}
					/>
					<Trans>Draft</Trans>
				</Label>
				<button
					type="button"
					onClick={() => void actions.createPr()}
					disabled={
						!actions.prTitle.trim() ||
						!actions.hasCommitsAhead ||
						actions.isShipping
					}
					className="flex h-7 items-center justify-center gap-1.5 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
				>
					{actions.isShipping && (
						<VscLoading className="size-3.5 animate-spin" />
					)}
					<Trans>Create pull request</Trans>
				</button>
			</div>
		</div>
	);
}
