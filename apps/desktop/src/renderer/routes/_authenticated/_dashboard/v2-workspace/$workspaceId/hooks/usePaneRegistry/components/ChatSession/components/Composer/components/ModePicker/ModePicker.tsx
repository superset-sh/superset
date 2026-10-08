import { useLingui } from "@lingui/react/macro";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import {
	FastForward,
	FilePen,
	type LucideIcon,
	NotebookPen,
	Pause,
	Play,
	SlidersHorizontal,
} from "lucide-react";
import { useState } from "react";
import { LuCheck, LuChevronDown } from "react-icons/lu";
import { isUnrestrictedMode } from "../../../../utils/isUnrestrictedMode";
import {
	MENU_DESCRIPTION_CLASS,
	MENU_ROW_CLASS,
	PILL_CHEVRON_CLASS,
	PILL_TRIGGER_CLASS,
} from "../../constants";

export type SessionMode = { id: string; label: string };

type ModeCopy = {
	title: string;
	description: string;
	icon: LucideIcon;
	unrestricted?: boolean;
};

const HIDDEN_MODE_IDS = new Set(["plan", "acceptEdits", "workspace-write"]);
const SOLID_ICONS = new Set<LucideIcon>([Pause, Play, FastForward]);
const UNRESTRICTED_TINT = "text-amber-500 opacity-65";

export function ModePicker({
	currentModeId,
	modes,
	onSelect,
}: {
	modes: SessionMode[];
	currentModeId: string | undefined;
	onSelect: (modeId: string) => void;
}) {
	const { t } = useLingui();
	const [highlightedId, setHighlightedId] = useState<string>();
	const offeredModes = modes.filter((mode) => !HIDDEN_MODE_IDS.has(mode.id));
	if (offeredModes.length < 2) return null;

	const knownModes: Record<string, ModeCopy> = {
		default: {
			title: t({ message: "Ask for approval" }),
			description: t({ message: "Asks before edits and commands" }),
			icon: Pause,
		},
		acceptEdits: {
			title: t({ message: "Approve edits" }),
			description: t({
				message: "Edit files without asking; ask before commands",
			}),
			icon: FilePen,
		},
		plan: {
			title: t({ message: "Plan" }),
			description: t({ message: "Read and plan without changing anything" }),
			icon: NotebookPen,
		},
		"read-only": {
			title: t({ message: "Ask for approval" }),
			description: t({ message: "Asks before edits and commands" }),
			icon: Pause,
		},
		auto: {
			title: t({ message: "Approve for me" }),
			description: t({ message: "Asks only for risky actions" }),
			icon: Play,
		},
		bypassPermissions: {
			title: t({ message: "Full access" }),
			description: t({ message: "Never asks before acting" }),
			icon: FastForward,
		},
		"full-access": {
			title: t({ message: "Full access" }),
			description: t({ message: "Never asks before acting" }),
			icon: FastForward,
		},
		"agent-full-access": {
			title: t({ message: "Full access" }),
			description: t({ message: "Never asks before acting" }),
			icon: FastForward,
		},
		agent: {
			title: t({ message: "Approve for me" }),
			description: t({ message: "Asks only for risky actions" }),
			icon: Play,
		},
	};
	const copyFor = (mode: SessionMode): ModeCopy => ({
		...(knownModes[mode.id] ?? {
			title: mode.label,
			description: "",
			icon: SlidersHorizontal,
		}),
		unrestricted: isUnrestrictedMode(mode.id),
	});

	const current =
		modes.find((mode) => mode.id === currentModeId) ?? offeredModes[0];
	if (!current) return null;
	const currentCopy = copyFor(current);
	const CurrentIcon = currentCopy.icon;

	const iconProps = (copy: ModeCopy) => ({
		className: cn(
			"size-3.5 shrink-0",
			SOLID_ICONS.has(copy.icon) && "fill-current",
			copy.unrestricted && UNRESTRICTED_TINT,
		),
		strokeWidth: SOLID_ICONS.has(copy.icon) ? 1 : 2,
	});
	const highlighted =
		offeredModes.find((mode) => mode.id === highlightedId) ?? current;
	const footer = copyFor(highlighted).description;

	return (
		<DropdownMenu
			onOpenChange={(open) => {
				if (!open) setHighlightedId(undefined);
			}}
		>
			<DropdownMenuTrigger asChild>
				<button
					className={cn(PILL_TRIGGER_CLASS, "group max-w-40")}
					type="button"
				>
					<CurrentIcon {...iconProps(currentCopy)} />
					<span className="truncate">{currentCopy.title}</span>
					<LuChevronDown className={PILL_CHEVRON_CLASS} />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				aria-label={t({
					message: "How should the agent's actions be approved?",
				})}
				className="w-[210px] rounded-xl"
				side="top"
			>
				{offeredModes.map((mode) => {
					const copy = copyFor(mode);
					const Icon = copy.icon;
					return (
						<DropdownMenuItem
							className={MENU_ROW_CLASS}
							key={mode.id}
							onFocus={() => setHighlightedId(mode.id)}
							onSelect={() => {
								if (mode.id !== currentModeId) onSelect(mode.id);
							}}
						>
							<Icon {...iconProps(copy)} />
							<span className="min-w-0 flex-1 truncate">{copy.title}</span>
							{mode.id === current.id ? (
								<LuCheck className="size-3.5 shrink-0" />
							) : null}
						</DropdownMenuItem>
					);
				})}
				{footer ? (
					<div className="-mx-1 mt-1 -mb-1 border-t px-3 py-2">
						<div
							className={cn(
								MENU_DESCRIPTION_CLASS,
								"line-clamp-2 text-muted-foreground",
							)}
						>
							{footer}
						</div>
					</div>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
