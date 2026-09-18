"use client";

import { useLingui } from "@lingui/react/macro";
import {
	type ComposedImage,
	MAX_COMMENT_IMAGE_BYTES,
	MAX_COMMENT_IMAGES,
} from "@superset/shared/page-comments";
import { ImagePlus, Loader2, SendHorizontal, X } from "lucide-react";
import { type Ref, useEffect, useRef, useState } from "react";
import { isEnterSubmit } from "../../../../lib/keyboard";
import { cn } from "../../../../lib/utils";
import { Button } from "../../../ui/button";
import { Textarea } from "../../../ui/textarea";
import { useComments } from "../../providers/CommentProvider";

interface ComposerImage {
	id: string;
	name: string;
	contentType: string;
	previewUrl: string;
	status: "uploading" | "ready" | "error";
	fileId?: string;
}

/**
 * An object URL pins its blob in memory until revoked. A submitted image's
 * URL outlives the composer — the optimistic row renders it until the
 * server's copy arrives — so it is released on a delay instead of at
 * unmount.
 */
function revokeSoon(url: string) {
	setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

interface CommentComposerProps {
	/** A reply composer names its thread; a draft composer starts one. */
	isReply: boolean;
	onSubmit: (
		body: string,
		attachments: ComposedImage[],
	) => void | Promise<void>;
	onFocus?: () => void;
	autoFocus?: boolean;
	initialValue?: string;
	initialAttachments?: ComposedImage[];
	ref?: Ref<HTMLTextAreaElement>;
	className?: string;
}

export function CommentComposer({
	isReply,
	onSubmit,
	onFocus,
	autoFocus,
	initialValue,
	initialAttachments,
	ref,
	className,
}: CommentComposerProps) {
	const { t } = useLingui();
	const { uploadImage } = useComments();
	const [value, setValue] = useState(initialValue ?? "");
	const [images, setImages] = useState<ComposerImage[]>(() =>
		(initialAttachments ?? []).map((image) => ({
			id: image.fileId,
			name: image.name,
			contentType: image.contentType,
			previewUrl: image.previewUrl,
			status: "ready",
			fileId: image.fileId,
		})),
	);
	const [focused, setFocused] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const open = focused || value.trim().length > 0 || images.length > 0;
	const uploading = images.some((image) => image.status === "uploading");

	const imagesRef = useRef(images);
	imagesRef.current = images;
	useEffect(
		() => () => {
			// Whatever is still sitting in the composer dies with it; submitted
			// images were handed to `revokeSoon` and are no longer here.
			for (const image of imagesRef.current) {
				URL.revokeObjectURL(image.previewUrl);
			}
		},
		[],
	);

	const addFiles = (files: Iterable<File>) => {
		const room = MAX_COMMENT_IMAGES - imagesRef.current.length;
		const accepted = [...files]
			.filter(
				(file) =>
					file.type.startsWith("image/") &&
					file.size <= MAX_COMMENT_IMAGE_BYTES,
			)
			.slice(0, Math.max(room, 0));
		for (const file of accepted) {
			const id = crypto.randomUUID();
			const previewUrl = URL.createObjectURL(file);
			setImages((current) => [
				...current,
				{
					id,
					name: file.name || "image",
					contentType: file.type,
					previewUrl,
					status: "uploading",
				},
			]);
			void file
				.arrayBuffer()
				.then((bytes) =>
					uploadImage({
						name: file.name || "image",
						contentType: file.type,
						bytes,
					}),
				)
				.then(({ fileId }) => {
					setImages((current) =>
						current.map((image) =>
							image.id === id
								? { ...image, status: "ready" as const, fileId }
								: image,
						),
					);
				})
				.catch(() => {
					setImages((current) =>
						current.map((image) =>
							image.id === id ? { ...image, status: "error" as const } : image,
						),
					);
				});
		}
	};

	const removeImage = (id: string) => {
		setImages((current) => {
			const removed = current.find((image) => image.id === id);
			if (removed) URL.revokeObjectURL(removed.previewUrl);
			return current.filter((image) => image.id !== id);
		});
	};

	const submit = () => {
		const body = value.trim();
		const ready = images.filter(
			(image): image is ComposerImage & { fileId: string } =>
				image.status === "ready" && image.fileId !== undefined,
		);
		if (uploading || (!body && ready.length === 0)) return;
		const attachments = ready.map((image) => ({
			fileId: image.fileId,
			name: image.name,
			contentType: image.contentType,
			previewUrl: image.previewUrl,
		}));
		setValue("");
		setImages((current) => current.filter((image) => image.status === "error"));
		for (const image of ready) revokeSoon(image.previewUrl);
		Promise.resolve(onSubmit(body, attachments)).catch(() => {
			setValue((current) => current || body);
		});
	};

	const addFilesRef = useRef(addFiles);
	addFilesRef.current = addFiles;
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const onDragOver = (event: DragEvent) => {
			if (event.dataTransfer?.types.includes("Files")) {
				event.preventDefault();
			}
		};
		const onDrop = (event: DragEvent) => {
			const dropped = event.dataTransfer?.files;
			if (!dropped?.length) return;
			event.preventDefault();
			addFilesRef.current(dropped);
		};
		container.addEventListener("dragover", onDragOver);
		container.addEventListener("drop", onDrop);
		return () => {
			container.removeEventListener("dragover", onDragOver);
			container.removeEventListener("drop", onDrop);
		};
	}, []);

	return (
		<div ref={containerRef} className={cn("flex flex-col", className)}>
			<Textarea
				ref={ref}
				autoFocus={autoFocus}
				value={value}
				onChange={(event) => setValue(event.target.value)}
				onFocus={() => {
					setFocused(true);
					onFocus?.();
				}}
				onBlur={() => setFocused(false)}
				onPaste={(event) => {
					const files = [...event.clipboardData.files].filter((file) =>
						file.type.startsWith("image/"),
					);
					if (files.length === 0) return;
					event.preventDefault();
					addFiles(files);
				}}
				onKeyDown={(event) => {
					if (isEnterSubmit(event)) {
						event.preventDefault();
						submit();
					}
				}}
				placeholder={
					isReply
						? t({ message: "Reply to thread…" })
						: t({ message: "Write a comment…" })
				}
				className={cn(
					"resize-none rounded-none border-0 bg-transparent p-3 text-sm shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent",
					open ? "min-h-[52px]" : "min-h-9 py-2",
				)}
			/>
			{images.length > 0 ? (
				<div className="flex flex-wrap gap-1.5 px-3 pb-2">
					{images.map((image) => (
						<div
							key={image.id}
							className={cn(
								"group/image relative size-12 overflow-hidden rounded-md border",
								image.status === "error" && "border-destructive",
							)}
							title={
								image.status === "error"
									? t({ message: `Couldn't upload ${image.name}` })
									: image.name
							}
						>
							<img
								src={image.previewUrl}
								alt={image.name}
								className={cn(
									"size-full object-cover",
									image.status !== "ready" && "opacity-50",
								)}
							/>
							{image.status === "uploading" ? (
								<Loader2 className="absolute inset-0 m-auto size-4 animate-spin text-foreground" />
							) : null}
							<button
								type="button"
								aria-label={t({ message: "Remove image" })}
								onClick={() => removeImage(image.id)}
								className="absolute top-0.5 right-0.5 rounded-full bg-background/80 p-0.5 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/image:opacity-100"
							>
								<X className="size-3" />
							</button>
						</div>
					))}
				</div>
			) : null}
			{open ? (
				<div className="flex items-center gap-2 px-3 pb-2.5">
					<input
						ref={fileInputRef}
						type="file"
						accept="image/*"
						multiple
						hidden
						onChange={(event) => {
							if (event.target.files) addFiles(event.target.files);
							event.target.value = "";
						}}
					/>
					<Button
						size="icon"
						variant="ghost"
						className="size-7 rounded-md text-muted-foreground hover:text-foreground"
						onClick={() => fileInputRef.current?.click()}
						aria-label={t({ message: "Attach image" })}
						disabled={images.length >= MAX_COMMENT_IMAGES}
					>
						<ImagePlus className="size-3.5" />
					</Button>
					<Button
						size="icon"
						className="ml-auto size-7 rounded-md"
						onClick={submit}
						aria-label={
							isReply
								? t({ message: "Send reply" })
								: t({ message: "Post comment" })
						}
						disabled={
							uploading ||
							(value.trim().length === 0 &&
								!images.some((image) => image.status === "ready"))
						}
					>
						{uploading ? (
							<Loader2 className="size-3.5 animate-spin" />
						) : (
							<SendHorizontal className="size-3.5" />
						)}
					</Button>
				</div>
			) : null}
		</div>
	);
}
