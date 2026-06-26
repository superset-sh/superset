/**
 * Accelerator strings used by the Electron application menu.
 *
 * Kept in a dedicated module (no electron imports) so the
 * menu/hotkey-registry collision test can pull them in without
 * dragging in the rest of the main-process graph.
 */

// Standard File→Open convention. Issue #4964 covered a regression where
// this collided with OPEN_IN_APP on macOS — see menu.test.ts.
export const OPEN_REPO_ACCELERATOR = "CmdOrCtrl+O";
