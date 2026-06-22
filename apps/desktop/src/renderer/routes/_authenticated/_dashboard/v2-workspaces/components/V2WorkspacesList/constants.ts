// Shared grid template used by the column header row and every workspace row
// so the Sidebar action / Name / Host / Branch / Created / Actions columns
// align across the whole view. Columns hide progressively on narrower
// viewports; the trailing 2.5rem column reserves space for the delete action.
export const V2_WORKSPACES_ROW_GRID =
	"grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] gap-4 md:grid-cols-[2.5rem_minmax(0,1fr)_12rem_2.5rem] lg:grid-cols-[2.5rem_minmax(0,1fr)_12rem_14rem_2.5rem] xl:grid-cols-[2.5rem_minmax(0,1fr)_12rem_14rem_11rem_2.5rem] items-center";
