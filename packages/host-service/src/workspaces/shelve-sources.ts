/**
 * Where an archive ("shelve") or unarchive came from, carried on the
 * mutation input and emitted with the host-side analytics event. Host-side
 * emission is what lets CLI/MCP archives count alongside the desktop's; the
 * renderer never tracks these itself.
 */
export const ARCHIVE_WORKSPACE_SOURCES = [
	"sidebar",
	"sidebar-menu",
	"hotkey",
	"command-palette",
	"workspaces-page",
	"bulk",
] as const;
export type ArchiveWorkspaceSource = (typeof ARCHIVE_WORKSPACE_SOURCES)[number];

export const UNARCHIVE_WORKSPACE_SOURCES = [
	"undo-toast",
	"workspaces-page",
	"deep-link",
] as const;
export type UnarchiveWorkspaceSource =
	(typeof UNARCHIVE_WORKSPACE_SOURCES)[number];
