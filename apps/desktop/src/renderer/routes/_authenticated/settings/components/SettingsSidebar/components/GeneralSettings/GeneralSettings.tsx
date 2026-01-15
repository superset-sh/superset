import { cn } from "@superset/ui/utils";
import { Link, useMatchRoute } from "@tanstack/react-router";
import {
	HiOutlineAdjustmentsHorizontal,
	HiOutlineBell,
	HiOutlineCog6Tooth,
	HiOutlineCommandLine,
	HiOutlinePaintBrush,
	HiOutlineUser,
	HiOutlineUserGroup,
} from "react-icons/hi2";

type SettingsRoute =
	| "/settings/account"
	| "/settings/team"
	| "/settings/appearance"
	| "/settings/ringtones"
	| "/settings/keyboard"
	| "/settings/presets"
	| "/settings/behavior";

const GENERAL_SECTIONS: {
	id: SettingsRoute;
	label: string;
	icon: React.ReactNode;
}[] = [
	{
		id: "/settings/account",
		label: "Account",
		icon: <HiOutlineUser className="h-4 w-4" />,
	},
	{
		id: "/settings/team",
		label: "Organization",
		icon: <HiOutlineUserGroup className="h-4 w-4" />,
	},
	{
		id: "/settings/appearance",
		label: "Appearance",
		icon: <HiOutlinePaintBrush className="h-4 w-4" />,
	},
	{
		id: "/settings/ringtones",
		label: "Ringtones",
		icon: <HiOutlineBell className="h-4 w-4" />,
	},
	{
		id: "/settings/keyboard",
		label: "Keyboard Shortcuts",
		icon: <HiOutlineCommandLine className="h-4 w-4" />,
	},
	{
		id: "/settings/presets",
		label: "Presets",
		icon: <HiOutlineCog6Tooth className="h-4 w-4" />,
	},
	{
		id: "/settings/behavior",
		label: "Behavior",
		icon: <HiOutlineAdjustmentsHorizontal className="h-4 w-4" />,
	},
];

export function GeneralSettings() {
	const matchRoute = useMatchRoute();

	return (
		<div className="mb-4">
			<h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-2">
				General
			</h2>
			<nav className="flex flex-col gap-0.5">
				{GENERAL_SECTIONS.map((section) => {
					const isActive = matchRoute({ to: section.id });

					return (
						<Link
							key={section.id}
							to={section.id}
							className={cn(
								"flex items-center gap-3 px-3 py-1.5 text-sm rounded-md transition-colors text-left",
								isActive
									? "bg-accent text-accent-foreground"
									: "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
							)}
						>
							{section.icon}
							{section.label}
						</Link>
					);
				})}
			</nav>
		</div>
	);
}
