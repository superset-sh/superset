import { LuPlus } from "react-icons/lu";

export function V2SidebarHeader() {
	return (
		<div className="flex items-center justify-between border-b border-border px-3 py-2">
			<div>
				<div className="text-sm font-medium">Workspaces</div>
				<div className="text-xs text-muted-foreground">V2 Cloud</div>
			</div>
			<button
				type="button"
				disabled
				className="rounded-md p-1 text-muted-foreground opacity-50"
			>
				<LuPlus className="size-4" />
			</button>
		</div>
	);
}
