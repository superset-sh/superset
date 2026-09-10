/**
 * The key given to the window that inherits pre-multi-window state.
 *
 * A profile written before multi-window holds exactly one of each per-window
 * record: one `tabsState` in app-state.json, one `router-history` in
 * localStorage. The first restored window adopts this key so a returning
 * user's tabs and route survive the upgrade; every window opened afterwards is
 * minted a fresh uuid and starts from its own record.
 *
 * It lives in shared because both processes need it. The main process assigns
 * it while restoring windows, and the renderer compares its own window key
 * against it to decide whether to claim the legacy localStorage record — a
 * decision it has to make synchronously, before React mounts.
 */
export const LEGACY_WINDOW_KEY = "legacy-single-window";

/**
 * How many routes a window's history keeps. Older entries fall off the front.
 */
export const MAX_ROUTER_HISTORY_ENTRIES = 100;

/**
 * Budget for the serialized history handed to a new renderer on its command
 * line. Windows caps a whole command line at 32767 characters, and this is one
 * of several arguments, so the payload is trimmed from the oldest entry until
 * it fits rather than trusting the entry count alone — a history of long paths
 * can be large while well under `MAX_ROUTER_HISTORY_ENTRIES`.
 */
export const MAX_ROUTER_HISTORY_ARGV_BYTES = 8192;

export const WINDOW_KEY_ARG = "--superset-window-key=";
export const ROUTER_HISTORY_ARG = "--superset-router-history=";
