import { UploadIcon } from "lucide-react";

interface FileDropOverlayProps {
	visible: boolean;
}

export function FileDropOverlay({ visible }: FileDropOverlayProps) {
	if (!visible) return null;

	return (
		<div className="mx-3 mt-3 flex self-stretch flex-col items-center gap-2 bg-muted py-6">
			<div className="flex size-8 items-center justify-center rounded-full bg-muted-foreground/20">
				<UploadIcon className="size-4 text-muted-foreground" />
			</div>
			<p className="font-medium text-foreground text-sm">Drop files here</p>
			<p className="text-muted-foreground text-xs">
				Images, PDFs, text files, or folders
			</p>
		</div>
	);
}
