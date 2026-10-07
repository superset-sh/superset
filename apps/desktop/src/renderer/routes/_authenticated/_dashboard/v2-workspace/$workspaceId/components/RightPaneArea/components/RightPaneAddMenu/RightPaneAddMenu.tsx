import { Trans } from "@lingui/react/macro";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@superset/ui/dropdown-menu";
import { BsTerminalPlus } from "react-icons/bs";
import {
	LuFileDiff,
	LuFiles,
	LuFileText,
	LuFolderTree,
	LuGitPullRequestArrow,
} from "react-icons/lu";
import { TbWorld } from "react-icons/tb";
import type { RightPaneKind } from "../../types";

interface RightPaneAddMenuProps {
	onAdd: (kind: RightPaneKind) => void;
}

export function RightPaneAddMenu({ onAdd }: RightPaneAddMenuProps) {
	return (
		<>
			<DropdownMenuItem className="gap-2" onClick={() => onAdd("files")}>
				<LuFolderTree className="size-4" />
				<span>
					<Trans>Files</Trans>
				</span>
			</DropdownMenuItem>
			<DropdownMenuItem className="gap-2" onClick={() => onAdd("diff")}>
				<LuFileDiff className="size-4" />
				<span>
					<Trans>Changes</Trans>
				</span>
			</DropdownMenuItem>
			<DropdownMenuItem className="gap-2" onClick={() => onAdd("changes-list")}>
				<LuFiles className="size-4" />
				<span>
					<Trans>Files changed</Trans>
				</span>
			</DropdownMenuItem>
			<DropdownMenuItem className="gap-2" onClick={() => onAdd("review")}>
				<LuGitPullRequestArrow className="size-4" />
				<span>
					<Trans>Review</Trans>
				</span>
			</DropdownMenuItem>
			<DropdownMenuItem className="gap-2" onClick={() => onAdd("pages-list")}>
				<LuFileText className="size-4" />
				<span>
					<Trans>Pages</Trans>
				</span>
			</DropdownMenuItem>
			<DropdownMenuSeparator />
			<DropdownMenuItem className="gap-2" onClick={() => onAdd("browser")}>
				<TbWorld className="size-4" />
				<span>
					<Trans>Browser</Trans>
				</span>
			</DropdownMenuItem>
			<DropdownMenuItem className="gap-2" onClick={() => onAdd("terminal")}>
				<BsTerminalPlus className="size-4" />
				<span>
					<Trans>Terminal</Trans>
				</span>
			</DropdownMenuItem>
		</>
	);
}
