import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { errorMessage } from "@superset/i18n/errors";
import { Button } from "@superset/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { createElement, useCallback, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { IconType } from "react-icons";
import {
	LuBug,
	LuCode,
	LuFlame,
	LuFolder,
	LuGlobe,
	LuHeart,
	LuLeaf,
	LuPackage,
	LuRocket,
	LuStar,
	LuTerminal,
	LuUpload,
	LuZap,
} from "react-icons/lu";
import { ColorSelector } from "renderer/components/ColorSelector";
import { PROJECT_ICON_NONE } from "renderer/hooks/host-projects/resolveProjectIconUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import { PROJECT_COLOR_DEFAULT } from "shared/constants/project-colors";

const ACCEPTED_MIME_TYPES = "image/png,image/jpeg,image/webp";
// Guard the source file before we bother decoding it; the stored icon is the
// downscaled square below, not the original.
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const ICON_SIZE = 128;

// Neutral glyph tint when the project has no accent color (slate).
const DEFAULT_GLYPH_COLOR = "#64748b";

const GLYPHS: Array<{
	name: string;
	label: MessageDescriptor;
	icon: IconType;
}> = [
	{
		name: "Folder",
		label: msg({ message: "Folder" }),
		icon: LuFolder,
	},
	{
		name: "Rocket",
		label: msg({ message: "Rocket" }),
		icon: LuRocket,
	},
	{
		name: "Star",
		label: msg({ message: "Star" }),
		icon: LuStar,
	},
	{
		name: "Heart",
		label: msg({ message: "Heart" }),
		icon: LuHeart,
	},
	{
		name: "Zap",
		label: msg({ message: "Zap" }),
		icon: LuZap,
	},
	{
		name: "Flame",
		label: msg({ message: "Flame" }),
		icon: LuFlame,
	},
	{
		name: "Leaf",
		label: msg({ message: "Leaf" }),
		icon: LuLeaf,
	},
	{
		name: "Globe",
		label: msg({ message: "Globe" }),
		icon: LuGlobe,
	},
	{
		name: "Code",
		label: msg({ message: "Code" }),
		icon: LuCode,
	},
	{
		name: "Terminal",
		label: msg({
			message: "Terminal",
		}),
		icon: LuTerminal,
	},
	{
		name: "Bug",
		label: msg({ message: "Bug" }),
		icon: LuBug,
	},
	{
		name: "Package",
		label: msg({
			message: "Package",
		}),
		icon: LuPackage,
	},
];

interface IconUploadFieldProps {
	projectId: string;
	/** For the letter placeholder when no icon resolves. */
	projectName: string;
	/** Host serving this project; null when unreachable (picker disabled). */
	hostUrl: string | null;
	/** Resolved icon to preview (custom icon, else GitHub avatar, else none). */
	iconUrl: string | null;
	/** True when a custom icon (glyph/upload) is set. */
	hasCustomIcon: boolean;
	/** True when the icon is explicitly removed (the "none" sentinel). */
	isIconRemoved: boolean;
	/** Persisted accent color (`#rrggbb`), or null for the default. */
	color: string | null;
}

function hexToRgba(hex: string, alpha: number): string {
	const r = Number.parseInt(hex.slice(1, 3), 16);
	const g = Number.parseInt(hex.slice(3, 5), 16);
	const b = Number.parseInt(hex.slice(5, 7), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Rasterize an SVG string to a square PNG data-URI. */
async function svgToPngDataUri(svg: string): Promise<string> {
	const img = await new Promise<HTMLImageElement>((resolve, reject) => {
		const el = new Image();
		el.onload = () => resolve(el);
		el.onerror = () => reject(new Error("Could not render icon"));
		el.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
	});
	const canvas = document.createElement("canvas");
	canvas.width = ICON_SIZE;
	canvas.height = ICON_SIZE;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Could not render icon");
	ctx.drawImage(img, 0, 0, ICON_SIZE, ICON_SIZE);
	return canvas.toDataURL("image/png");
}

/** Bake a glyph onto a tinted tile as a PNG data-URI (same treatment as the
 * letter fallback: full-strength glyph on a 15%-alpha background). */
function glyphToDataUri(
	glyph: IconType,
	color: string | null,
): Promise<string> {
	const stroke = color ?? DEFAULT_GLYPH_COLOR;
	const bg = hexToRgba(stroke, color ? 0.15 : 0.12);
	const glyphMarkup = renderToStaticMarkup(
		createElement(glyph, { size: 72, color: stroke }),
	);
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}">` +
		`<rect width="${ICON_SIZE}" height="${ICON_SIZE}" fill="${bg}"/>` +
		`<g transform="translate(28,28)">${glyphMarkup}</g></svg>`;
	return svgToPngDataUri(svg);
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
	projectName,
	hostUrl,
	iconUrl,
	hasCustomIcon,
	isIconRemoved,
	color,
}: IconUploadFieldProps) {
	const { t } = useLingui();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isPending, setIsPending] = useState(false);
	// Glyph picked in this popover session — lets a later color pick re-bake
	// it, since a baked PNG can't follow the color on its own.
	const [sessionGlyph, setSessionGlyph] = useState<IconType | null>(null);
	const disabled = isPending || !hostUrl;

	const setIcon = useCallback(
		async (icon: string | null): Promise<boolean> => {
			if (!hostUrl) {
				toast.error(
					t({
						message: "This project's host is offline",
					}),
				);
				return false;
			}
			setIsPending(true);
			try {
				await getHostServiceClientByUrl(hostUrl).project.setIcon.mutate({
					projectId,
					icon,
				});
				return true;
			} catch (err) {
				toast.error(
					errorMessage(
						err,
						t({
							message: "Failed to set icon",
						}),
					),
				);
				return false;
			} finally {
				setIsPending(false);
			}
		},
		[hostUrl, projectId, t],
	);

	const setColor = useCallback(
		async (nextColor: string | null): Promise<boolean> => {
			if (!hostUrl) {
				toast.error(
					t({
						message: "This project's host is offline",
					}),
				);
				return false;
			}
			setIsPending(true);
			try {
				await getHostServiceClientByUrl(hostUrl).project.setColor.mutate({
					projectId,
					color: nextColor,
				});
				return true;
			} catch (err) {
				toast.error(
					errorMessage(
						err,
						t({
							message: "Failed to set color",
						}),
					),
				);
				return false;
			} finally {
				setIsPending(false);
			}
		},
		[hostUrl, projectId, t],
	);

	const handleSelectGlyph = useCallback(
		async (glyph: IconType) => {
			let dataUri: string;
			try {
				dataUri = await glyphToDataUri(glyph, color);
			} catch (err) {
				toast.error(
					errorMessage(
						err,
						t({
							message: "Could not set icon",
						}),
					),
				);
				return;
			}
			// Only a stored glyph may re-bake on later color picks.
			if (await setIcon(dataUri)) setSessionGlyph(() => glyph);
		},
		[color, setIcon, t],
	);

	const handleSelectColor = useCallback(
		async (value: string) => {
			const nextColor = value === PROJECT_COLOR_DEFAULT ? null : value;
			// A rejected color (offline host, old host without setColor) must not
			// re-tint the icon — the tile would show a color the project never
			// stored.
			if (!(await setColor(nextColor))) return;
			// Keep a glyph picked this session in sync with the new color.
			if (sessionGlyph) {
				try {
					await setIcon(await glyphToDataUri(sessionGlyph, nextColor));
				} catch {
					// Color persisted; a failed re-bake keeps the previous tile.
				}
			}
		},
		[sessionGlyph, setColor, setIcon],
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
				toast.error(
					t({
						message: "Image is too large (max 10MB)",
					}),
				);
				return;
			}
			let dataUri: string;
			try {
				dataUri = await toIconDataUri(file);
			} catch (err) {
				toast.error(
					errorMessage(
						err,
						t({
							message: "Could not read selected file",
						}),
					),
				);
				return;
			}
			setSessionGlyph(null);
			await setIcon(dataUri);
		},
		[setIcon, t],
	);

	return (
		<>
			<Popover>
				<PopoverTrigger asChild>
					<button
						type="button"
						disabled={disabled}
						aria-label={t({
							message: "Change project icon and color",
						})}
						className="rounded-md transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
					>
						<ProjectThumbnail
							projectName={projectName}
							iconUrl={iconUrl}
							color={color}
							className="size-9 rounded-md text-sm"
						/>
					</button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-66 space-y-3">
					<div>
						<p className="mb-1.5 text-xs font-medium text-muted-foreground">
							<Trans>Color</Trans>
						</p>
						<ColorSelector
							includeDefault
							selectedColor={color}
							disabled={disabled}
							onSelectColor={(value) => {
								void handleSelectColor(value);
							}}
						/>
					</div>
					<div>
						<p className="mb-1.5 text-xs font-medium text-muted-foreground">
							<Trans>Icon</Trans>
						</p>
						<div className="grid grid-cols-6 gap-1">
							{GLYPHS.map((glyph) => (
								<button
									key={glyph.name}
									type="button"
									title={i18n._(glyph.label)}
									aria-label={t({
										message: `Set icon to ${i18n._(glyph.label)}`,
									})}
									disabled={disabled}
									onClick={() => {
										void handleSelectGlyph(glyph.icon);
									}}
									className={cn(
										"flex size-8 items-center justify-center rounded-md border border-transparent",
										"hover:bg-accent hover:text-accent-foreground",
										"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
										"disabled:cursor-not-allowed disabled:opacity-50",
									)}
									style={{ color: color ?? undefined }}
								>
									<glyph.icon className="size-4" />
								</button>
							))}
						</div>
					</div>
					<div className="flex flex-wrap items-center gap-2 border-t pt-3">
						<Button
							variant="outline"
							size="sm"
							disabled={disabled}
							onClick={handleClickUpload}
						>
							<LuUpload className="size-3.5" />
							<Trans>Upload image…</Trans>
						</Button>
						{iconUrl && (
							<Button
								variant="ghost"
								size="sm"
								disabled={disabled}
								onClick={() => {
									setSessionGlyph(null);
									void setIcon(PROJECT_ICON_NONE);
								}}
							>
								<Trans>Remove icon</Trans>
							</Button>
						)}
						{(hasCustomIcon || isIconRemoved) && (
							<Button
								variant="ghost"
								size="sm"
								disabled={disabled}
								onClick={() => {
									setSessionGlyph(null);
									void setIcon(null);
								}}
							>
								<Trans>Reset to default</Trans>
							</Button>
						)}
					</div>
				</PopoverContent>
			</Popover>
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
