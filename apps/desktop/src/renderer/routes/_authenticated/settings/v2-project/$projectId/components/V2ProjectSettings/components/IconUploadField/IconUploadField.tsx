import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { useCallback, useRef, useState } from "react";
import { LuImagePlus, LuRotateCcw, LuUpload } from "react-icons/lu";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

const ACCEPTED_MIME_TYPES = "image/png,image/jpeg,image/webp";
// Guard the source file before we bother decoding it; the stored icon is the
// downscaled square below, not the original.
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const ICON_SIZE = 128;

interface IconUploadFieldProps {
	projectId: string;
	/** Host serving this project; null when unreachable (upload disabled). */
	hostUrl: string | null;
	/** Resolved icon to preview (custom icon, else GitHub avatar, else none). */
	iconUrl: string | null;
	/** True when a custom icon is set — enables "Reset to default". */
	hasCustomIcon: boolean;
}

/** Downscale an image file to a small square PNG data-URI (cover-fit). */
async function toIconDataUri(file: File): Promise<string> {
	const url = URL.createObjectURL(file);
	try {
		const img = await new Promise<HTMLImageElement>((resolve, reject) => {
			const el = new Image();
			el.onload = () => resolve(el);
			el.onerror = () => reject(new Error("Could not read image"));
			el.src = url;
		});
		const canvas = document.createElement("canvas");
		canvas.width = ICON_SIZE;
		canvas.height = ICON_SIZE;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("Could not render image");
		const scale = Math.max(ICON_SIZE / img.width, ICON_SIZE / img.height);
		const w = img.width * scale;
		const h = img.height * scale;
		ctx.drawImage(img, (ICON_SIZE - w) / 2, (ICON_SIZE - h) / 2, w, h);
		return canvas.toDataURL("image/png");
	} finally {
		URL.revokeObjectURL(url);
	}
}

export function IconUploadField({
	projectId,
	hostUrl,
	iconUrl,
	hasCustomIcon,
}: IconUploadFieldProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isPending, setIsPending] = useState(false);
	const disabled = isPending || !hostUrl;

	const setIcon = useCallback(
		async (icon: string | null) => {
			if (!hostUrl) {
				toast.error("This project's host is offline");
				return;
			}
			setIsPending(true);
			try {
				await getHostServiceClientByUrl(hostUrl).project.setIcon.mutate({
					projectId,
					icon,
				});
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "Failed to set icon");
			} finally {
				setIsPending(false);
			}
		},
		[hostUrl, projectId],
	);

	const handleClickUpload = useCallback(() => {
		if (!fileInputRef.current) return;
		fileInputRef.current.value = "";
		fileInputRef.current.click();
	}, []);

	const handleFileChange = useCallback(
		async (e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			e.target.value = "";
			if (!file) return;
			if (file.size > MAX_SOURCE_BYTES) {
				toast.error("Image is too large (max 10MB)");
				return;
			}
			let dataUri: string;
			try {
				dataUri = await toIconDataUri(file);
			} catch (err) {
				toast.error(
					err instanceof Error ? err.message : "Could not read selected file",
				);
				return;
			}
			await setIcon(dataUri);
		},
		[setIcon],
	);

	const Thumbnail = (
		<button
			type="button"
			onClick={hasCustomIcon ? undefined : handleClickUpload}
			disabled={disabled}
			aria-label={
				hasCustomIcon
					? "Project icon options"
					: iconUrl
						? "Replace icon"
						: "Upload icon"
			}
			className="size-9 rounded-md border overflow-hidden flex items-center justify-center text-muted-foreground transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
		>
			{iconUrl ? (
				<img
					src={iconUrl}
					alt="Project icon"
					className="size-full object-cover"
				/>
			) : (
				<LuImagePlus className="size-4" />
			)}
		</button>
	);

	return (
		<>
			{hasCustomIcon ? (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>{Thumbnail}</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-48">
						<DropdownMenuItem onSelect={handleClickUpload} disabled={disabled}>
							<LuUpload className="size-4" />
							Upload image…
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							variant="destructive"
							disabled={disabled}
							onSelect={() => {
								void setIcon(null);
							}}
						>
							<LuRotateCcw className="size-4" />
							Reset to default
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			) : (
				Thumbnail
			)}
			<input
				ref={fileInputRef}
				type="file"
				accept={ACCEPTED_MIME_TYPES}
				className="hidden"
				onChange={handleFileChange}
			/>
		</>
	);
}
