import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { LuListFilter } from "react-icons/lu";
import type { LogLevel } from "../../utils/parseLogLine";

const LEVELS: Array<{ level: LogLevel; label: MessageDescriptor }> = [
	{ level: "debug", label: msg({ message: "Debug" }) },
	{ level: "info", label: msg({ message: "Info" }) },
	{ level: "default", label: msg({ message: "Default" }) },
	{ level: "error", label: msg({ message: "Error" }) },
	{ level: "fault", label: msg({ message: "Fault" }) },
];

interface LogLevelMenuProps {
	hidden: ReadonlySet<LogLevel>;
	onToggle: (level: LogLevel) => void;
}

export function LogLevelMenu({ hidden, onToggle }: LogLevelMenuProps) {
	const { t } = useLingui();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon-xs"
					aria-label={t({ message: "Log levels" })}
					className={
						hidden.size > 0
							? "text-foreground"
							: "text-muted-foreground hover:text-foreground"
					}
				>
					<LuListFilter className="size-3.5" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{LEVELS.map(({ level, label }) => (
					<DropdownMenuCheckboxItem
						key={level}
						checked={!hidden.has(level)}
						onCheckedChange={() => onToggle(level)}
						onSelect={(event) => event.preventDefault()}
						className="text-xs"
					>
						{i18n._(label)}
					</DropdownMenuCheckboxItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
