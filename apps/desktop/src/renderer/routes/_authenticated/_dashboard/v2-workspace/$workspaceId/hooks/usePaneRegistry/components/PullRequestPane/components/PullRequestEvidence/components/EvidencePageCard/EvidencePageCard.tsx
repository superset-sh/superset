import { PageThumbnail } from "renderer/routes/_authenticated/_dashboard/components/PageThumbnail";

export interface EvidencePage {
	id: string;
	slug: string;
	title: string;
	thumbnailUrl: string | null;
}

interface EvidencePageCardProps {
	page: EvidencePage;
	onOpen: (page: EvidencePage) => void;
}

export function EvidencePageCard({ page, onOpen }: EvidencePageCardProps) {
	return (
		<button
			type="button"
			onClick={() => onOpen(page)}
			title={page.title}
			className="relative flex min-w-0 flex-col gap-3 rounded-lg bg-muted p-2 text-foreground after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:bg-fill-hover after:opacity-0 after:transition-opacity hover:after:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<span className="flex h-16 w-full overflow-hidden rounded-lg">
				<PageThumbnail src={page.thumbnailUrl} fill className="bg-fill-hover" />
			</span>
			<span className="w-full truncate text-center text-[13px] font-medium leading-4">
				{page.title}
			</span>
		</button>
	);
}
