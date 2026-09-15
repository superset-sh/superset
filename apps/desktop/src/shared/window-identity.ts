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
