import {
	LuCheck,
	LuLoaderCircle,
	LuMinus,
	LuSkipForward,
	LuX,
} from "react-icons/lu";

// `dark:` isn't used here — this app's globals.css never defines
// `@custom-variant dark`, so `dark:` falls back to `prefers-color-scheme`
// (tracks the OS setting, not this app's own theme switcher) and silently
// never fired. `[.dark_&]` targets the real `.dark` class the theme store
// puts on <html>.
/** One icon/color pair per CI check status, shared by every checks surface. */
export const CHECK_STATUS_ICONS = {
	success: {
		Icon: LuCheck,
		className: "text-emerald-600 [.dark_&]:text-[#34d399]",
	},
	failure: {
		Icon: LuX,
		className: "text-red-600 [.dark_&]:text-[#f87171]",
	},
	pending: {
		Icon: LuLoaderCircle,
		className: "text-amber-600 [.dark_&]:text-[#fbbf24]",
	},
	skipped: { Icon: LuSkipForward, className: "text-muted-foreground" },
	cancelled: { Icon: LuMinus, className: "text-muted-foreground" },
} as const;
