import { useMatchRoute, useNavigate } from "@tanstack/react-router";

interface V2WorkspaceListItemProps {
	id: string;
	name: string;
	branch: string;
	deviceId: string | null;
}

export function V2WorkspaceListItem({
	id,
	name,
	branch,
}: V2WorkspaceListItemProps) {
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();

	const isActive = !!matchRoute({
		to: "/v2-workspace/$workspaceId",
		params: { workspaceId: id },
		fuzzy: true,
	});

	return (
		<button
			type="button"
			onClick={() =>
				navigate({
					to: "/v2-workspace/$workspaceId",
					params: { workspaceId: id },
				})
			}
			className={`flex w-full flex-col rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/50 ${
				isActive
					? "border-l-2 border-primary bg-muted/50"
					: "border-l-2 border-transparent"
			}`}
		>
			<span className="truncate">{name}</span>
			<span className="truncate text-xs text-muted-foreground">{branch}</span>
		</button>
	);
}
