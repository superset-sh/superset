import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";

const WEEKLY_SCOPED_PREFIX = "weekly_scoped:";

/** Codex names its extra limits itself; the id just carries that name. */
const ADDITIONAL_PREFIX = "additional:";

/** Window ids that name a model in the id itself rather than after a prefix. */
const SCOPED_MODEL_IDS: Record<string, string> = {
	seven_day_sonnet: "Sonnet",
};

/**
 * The usage window a switch cites, in words. Shared by the switch
 * notification and the Usage page's switch history so one window is never
 * named two ways — and so both translate: an English record read straight
 * into a sentence never reaches a catalog, because the interpolated value
 * becomes a placeholder argument rather than part of the message id.
 *
 * Brand model names are data and are never translated.
 */
export function windowLabel(windowId: string): string {
	if (windowId === "five_hour" || windowId === "primary") {
		return i18n._(msg({ message: "5-hour window" }));
	}
	if (windowId === "seven_day" || windowId === "secondary") {
		return i18n._(msg({ message: "weekly window" }));
	}
	const model = windowId.startsWith(WEEKLY_SCOPED_PREFIX)
		? windowId.slice(WEEKLY_SCOPED_PREFIX.length)
		: SCOPED_MODEL_IDS[windowId];
	if (model) return i18n._(msg({ message: `${model} weekly window` }));
	// The provider's own limit_name, which is what the id is built from — data
	// like the brand model names above, so it is not translated. Without this
	// the raw id reaches the user as "additional:gpt-5-high".
	if (windowId.startsWith(ADDITIONAL_PREFIX)) {
		return windowId.slice(ADDITIONAL_PREFIX.length);
	}
	return windowId;
}
