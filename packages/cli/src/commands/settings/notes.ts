/** How each settings store propagates into a running desktop app. */
export const LOCAL_DB_EFFECT =
	"The desktop app picks this up the next time its window regains focus (no restart needed).";

export const HOST_EFFECT =
	"Applied host-wide via the host service; the desktop app reflects it the next time its window regains focus.";

export const THEME_EFFECT =
	"Restart the Superset desktop app to apply. Quit it first if it's running; otherwise the app may overwrite this change.";

export const RINGTONE_EFFECT =
	"The new sound plays immediately; the selection shown in Settings → Notifications updates after the next app restart.";
