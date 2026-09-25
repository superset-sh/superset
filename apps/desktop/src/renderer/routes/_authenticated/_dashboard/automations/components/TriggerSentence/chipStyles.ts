/**
 * The chips a trigger sentence is built from.
 *
 * Filled rather than outlined, and always visible rather than appearing on
 * hover: a trigger reads as a sentence with editable words in it, and an
 * invisible control gives no hint that the word is a choice.
 */

/**
 * 24px tall, 13px text, tighter on the right where the chevron sits.
 *
 * A plain button rather than the shared Button: its size variants set height,
 * padding and font size, and a chip needs all three smaller than any variant
 * offers. Fighting that through class merging is how the first attempt ended up
 * 32px tall with the wrong padding.
 */
export const CHIP =
	"inline-flex h-6 w-auto min-w-0 shrink-0 items-center gap-1 rounded-[6px] bg-foreground/[0.06] py-0 pr-1.5 pl-2 text-[13px] leading-none transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

/** Unset reads as dimmer text, not as an error — nothing is wrong yet. */
export const CHIP_EMPTY = "text-muted-foreground";

/**
 * Marks the chips a save is blocked on.
 *
 * There is no Save button — the set saves itself once it is valid — so this is
 * the only thing that says which word is holding it back. A sentence can have
 * three chips where only one is empty, and the banner names the problem without
 * pointing at it.
 */
export const CHIP_INVALID =
	"ring-1 ring-amber-500/50 text-amber-600 dark:text-amber-400";
