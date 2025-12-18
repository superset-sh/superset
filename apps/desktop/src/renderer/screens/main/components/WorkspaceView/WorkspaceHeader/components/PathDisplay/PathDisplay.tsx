import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { HiOutlineFolder } from "react-icons/hi2";
import { getAppOption } from "renderer/components/OpenInButton";
import { shortenHomePath } from "renderer/lib/formatPath";
import { trpc } from "renderer/lib/trpc";

interface PathDisplayProps {
	path: string;
}

export function PathDisplay({ path }: PathDisplayProps) {
	const { data: homeDir } = trpc.window.getHomeDir.useQuery();
	const displayPath = shortenHomePath(path, homeDir);

	const utils = trpc.useUtils();
	const { data: lastUsedApp = "cursor" } =
		trpc.settings.getLastUsedApp.useQuery();

	const openInApp = trpc.external.openInApp.useMutation({
		onSuccess: () => utils.settings.getLastUsedApp.invalidate(),
	});

	const currentApp = getAppOption(lastUsedApp);

	const handleClick = () => {
		openInApp.mutate({ path, app: lastUsedApp });
	};

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={handleClick}
					className="flex items-center gap-1.5 min-w-0 overflow-hidden hover:text-foreground/80 transition-colors cursor-pointer"
				>
					<HiOutlineFolder className="w-3.5 h-3.5 shrink-0" />
					<span className="truncate">{displayPath}</span>
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom" showArrow={false}>
				Open in {currentApp.label}
			</TooltipContent>
		</Tooltip>
	);
}
