import { Trans } from "@lingui/react/macro";
import {
	DropdownMenuCheckboxItem,
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@superset/ui/dropdown-menu";
import { BsTerminalPlus } from "react-icons/bs";
import { LuGitCompareArrows } from "react-icons/lu";
import { TbDeviceDesktop, TbWorld } from "react-icons/tb";
import { HotkeyMenuShortcut } from "renderer/components/HotkeyMenuShortcut";

interface AddTabMenuProps {
	onAddTerminal: () => void;
	onAddBrowser: () => void;
	onAddChanges: () => void;
	onAddDesktop?: (() => void) | undefined;
	showPresetsBar: boolean;
	onToggleShowPresetsBar: (enabled: boolean) => void;
}

export function AddTabMenu({
	onAddTerminal,
	onAddBrowser,
	onAddChanges,
	onAddDesktop,
	showPresetsBar,
	onToggleShowPresetsBar,
}: AddTabMenuProps) {
	return (
		<>
			<DropdownMenuItem className="gap-2" onClick={onAddTerminal}>
				<BsTerminalPlus className="size-4" />
				<span>
					<Trans>Terminal</Trans>
				</span>
				<HotkeyMenuShortcut hotkeyId="NEW_GROUP" />
			</DropdownMenuItem>
			<DropdownMenuItem className="gap-2" onClick={onAddBrowser}>
				<TbWorld className="size-4" />
				<span>
					<Trans>Browser</Trans>
				</span>
				<HotkeyMenuShortcut hotkeyId="NEW_BROWSER" />
			</DropdownMenuItem>
			<DropdownMenuItem className="gap-2" onClick={onAddChanges}>
				<LuGitCompareArrows className="size-4" />
				<span>
					<Trans>Changes</Trans>
				</span>
				<HotkeyMenuShortcut hotkeyId="OPEN_DIFF_VIEWER" />
			</DropdownMenuItem>
			{onAddDesktop && (
				<DropdownMenuItem className="gap-2" onClick={onAddDesktop}>
					<TbDeviceDesktop className="size-4" />
					<span>
						<Trans>Desktop</Trans>
					</span>
					<HotkeyMenuShortcut hotkeyId="SPLIT_WITH_DESKTOP" />
				</DropdownMenuItem>
			)}
			<DropdownMenuSeparator />
			<DropdownMenuCheckboxItem
				checked={showPresetsBar}
				onCheckedChange={(checked) => onToggleShowPresetsBar(checked === true)}
				onSelect={(event) => event.preventDefault()}
			>
				<Trans>Show Scripts Bar</Trans>
			</DropdownMenuCheckboxItem>
		</>
	);
}
