import { Trans, useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuRadioGroup,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { ChevronDown } from "lucide-react";
import type { PullRequestDetail } from "../../hooks/usePullRequestDetail";
import {
	type PullRequestActionTarget,
	usePullRequestDraftMutation,
} from "../../hooks/usePullRequestDraftMutation";
import {
	PullRequestMenuContent,
	PullRequestMenuRadioItem,
} from "../PullRequestMenu";
import { PullRequestStateGlyph } from "../PullRequestStateGlyph";
import { PullRequestStatePill } from "../PullRequestStatePill";

interface PullRequestDraftStateMenuProps {
	data: Pick<PullRequestDetail, "state" | "isDraft" | "mergeability">;
	target: PullRequestActionTarget;
}

/** The state pill as a menu: an open pull request toggles between Draft and Ready for review. */
export function PullRequestDraftStateMenu({
	data,
	target,
}: PullRequestDraftStateMenuProps) {
	const { t } = useLingui();
	const setDraft = usePullRequestDraftMutation(target);
	const pendingLabel = setDraft.isPending
		? setDraft.variables
			? t({ message: "Converting to draft…" })
			: t({ message: "Marking ready…" })
		: null;
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				className="rounded-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
				aria-label={t({ message: "Change state" })}
				disabled={setDraft.isPending}
			>
				<PullRequestStatePill
					data={data}
					pendingLabel={pendingLabel}
					className={cn(
						"cursor-pointer pr-1.5",
						setDraft.isPending && "opacity-70",
					)}
					trailing={<ChevronDown aria-hidden className="size-3" />}
				/>
			</DropdownMenuTrigger>
			<PullRequestMenuContent align="start" className="w-52">
				<DropdownMenuRadioGroup
					value={data.isDraft ? "draft" : "ready"}
					onValueChange={(value) => {
						const draft = value === "draft";
						if (draft !== data.isDraft) setDraft.mutate(draft);
					}}
				>
					<PullRequestMenuRadioItem value="draft">
						<PullRequestStateGlyph state="draft" className="size-4" />
						<Trans>Draft</Trans>
					</PullRequestMenuRadioItem>
					<PullRequestMenuRadioItem value="ready">
						<PullRequestStateGlyph state="open" className="size-4" />
						<Trans>Ready for review</Trans>
					</PullRequestMenuRadioItem>
				</DropdownMenuRadioGroup>
			</PullRequestMenuContent>
		</DropdownMenu>
	);
}
