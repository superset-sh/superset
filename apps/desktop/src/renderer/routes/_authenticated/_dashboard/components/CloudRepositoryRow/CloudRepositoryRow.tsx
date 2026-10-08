import { resolveProjectIconUrl } from "renderer/hooks/host-projects/resolveProjectIconUrl";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";

interface CloudRepositoryRowProps {
	fullName: string;
	onOpen: () => void;
}

export function CloudRepositoryRow({
	fullName,
	onOpen,
}: CloudRepositoryRowProps) {
	return (
		<button
			type="button"
			onClick={onOpen}
			className="flex h-7 w-fit max-w-full items-center gap-2 rounded-sm px-2 text-left text-xs hover:bg-fill-hover"
		>
			<ProjectThumbnail
				projectName={fullName}
				iconUrl={resolveProjectIconUrl({
					icon: null,
					repoOwner: fullName.split("/")[0] || null,
				})}
				className="-mx-px size-4 rounded-[4px] text-[9px]"
			/>
			<span className="min-w-0 truncate">{fullName}</span>
		</button>
	);
}
