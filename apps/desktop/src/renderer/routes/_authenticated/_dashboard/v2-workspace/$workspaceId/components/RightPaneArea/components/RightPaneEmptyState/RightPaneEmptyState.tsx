import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	LuFileDiff,
	LuFileText,
	LuFolderTree,
	LuGitPullRequestArrow,
} from "react-icons/lu";
import { TbWorld } from "react-icons/tb";
import type { RightPaneKind } from "../../types";

interface RightPaneEmptyStateProps {
	onAdd: (kind: RightPaneKind) => void;
}

export function RightPaneEmptyState({ onAdd }: RightPaneEmptyStateProps) {
	return (
		<div className="flex flex-col items-center gap-3 p-4">
			<p className="text-sm text-muted-foreground">
				<Trans>Open a pane, or drag one here from the center.</Trans>
			</p>
			<div className="grid grid-cols-2 gap-2">
				<Button variant="outline" size="sm" onClick={() => onAdd("files")}>
					<LuFolderTree className="size-4" />
					<Trans>Files</Trans>
				</Button>
				<Button variant="outline" size="sm" onClick={() => onAdd("diff")}>
					<LuFileDiff className="size-4" />
					<Trans>Changes</Trans>
				</Button>
				<Button variant="outline" size="sm" onClick={() => onAdd("review")}>
					<LuGitPullRequestArrow className="size-4" />
					<Trans>Review</Trans>
				</Button>
				<Button variant="outline" size="sm" onClick={() => onAdd("pages-list")}>
					<LuFileText className="size-4" />
					<Trans>Pages</Trans>
				</Button>
				<Button variant="outline" size="sm" onClick={() => onAdd("browser")}>
					<TbWorld className="size-4" />
					<Trans>Browser</Trans>
				</Button>
			</div>
		</div>
	);
}
