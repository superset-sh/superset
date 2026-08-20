import {
	LuCheck,
	LuLoaderCircle,
	LuMinus,
	LuSkipForward,
	LuX,
} from "react-icons/lu";

/** One icon/color pair per CI check status, shared by every checks surface. */
export const CHECK_STATUS_ICONS = {
	success: {
		Icon: LuCheck,
		className: "text-emerald-600 dark:text-emerald-400",
	},
	failure: { Icon: LuX, className: "text-red-600 dark:text-red-400" },
	pending: {
		Icon: LuLoaderCircle,
		className: "text-amber-600 dark:text-amber-400",
	},
	skipped: { Icon: LuSkipForward, className: "text-muted-foreground" },
	cancelled: { Icon: LuMinus, className: "text-muted-foreground" },
} as const;
