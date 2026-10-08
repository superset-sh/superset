/** The one green and red every pull request surface draws additions,
 *  deletions, passing and failing from: the list row's pair, so a file reads
 *  the same tone in the list, the header, the rail, and the diff stat.
 *  `[.dark_&]` targets the `.dark` class the theme store puts on <html>;
 *  `dark:` here would track the OS setting instead. */
export const PR_GREEN_TEXT_CLASS_NAME =
	"text-emerald-600 [.dark_&]:text-[#34d399]";
export const PR_RED_TEXT_CLASS_NAME = "text-red-600 [.dark_&]:text-[#f87171]";
export const PR_GREEN_FILL_CLASS_NAME =
	"fill-emerald-600 [.dark_&]:fill-[#34d399]";
export const PR_RED_FILL_CLASS_NAME = "fill-red-600 [.dark_&]:fill-[#f87171]";
