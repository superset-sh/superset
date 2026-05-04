import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { useCallback, useRef, useState } from "react";
import { LuGithub, LuImagePlus, LuTrash2 } from "react-icons/lu";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

const ACCEPTED_MIME_TYPES = "image/png,image/jpeg,image/webp";
const MAX_SIZE_MB = 4.5;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

interface IconUploadFieldProps {
	projectId: string;
	iconUrl: string | null;
	hasGitHubRepo: boolean;
}

export function IconUploadField({
	projectId,
	iconUrl,
	hasGitHubRepo,
}: IconUploadFieldProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isPending, setIsPending] = useState(false);

	const handleClickUpload = useCallback(() => {
		if (!fileInputRef.current) return;
		fileInputRef.current.value = "";
		fileInputRef.current.click();
	}, []);

	const handleFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			e.target.value = "";
			if (!file) return;

			if (file.size > MAX_SIZE_BYTES) {
				const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
				toast.error(
					`File too large (${sizeInMB}MB). Maximum size is ${MAX_SIZE_MB}MB`,
				);
				return;
			}

			setIsPending(true);
			const reader = new FileReader();
			reader.onerror = () => {
				toast.error("Could not read selected file");
				setIsPending(false);
			};
			reader.onabort = () => {
				setIsPending(false);
			};
			reader.onload = async () => {
				const fileData = reader.result;
				if (typeof fileData !== "string") {
					toast.error("Could not read selected file");
					setIsPending(false);
					return;
				}
				try {
					await apiTrpcClient.v2Project.uploadIcon.mutate({
						id: projectId,
						fileData,
						fileName: file.name,
						mimeType: file.type,
					});
				} catch (err) {
					const message =
						err instanceof Error ? err.message : "Failed to upload icon";
					toast.error(message);
				} finally {
					setIsPending(false);
				}
			};
			reader.readAsDataURL(file);
		},
		[projectId],
	);

	const handleUseGitHub = useCallback(async () => {
		setIsPending(true);
		try {
			await apiTrpcClient.v2Project.resetIconToGitHub.mutate({ id: projectId });
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to fetch GitHub icon";
			toast.error(message);
		} finally {
			setIsPending(false);
		}
	}, [projectId]);

	const handleRemove = useCallback(async () => {
		setIsPending(true);
		try {
			await apiTrpcClient.v2Project.removeIcon.mutate({ id: projectId });
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to remove icon";
			toast.error(message);
		} finally {
			setIsPending(false);
		}
	}, [projectId]);

	return (
		<div className="flex items-center gap-3">
			{iconUrl ? (
				<img
					src={iconUrl}
					alt="Project icon"
					className="size-10 rounded object-cover border"
				/>
			) : (
				<div className="size-10 rounded border border-dashed flex items-center justify-center text-muted-foreground">
					<LuImagePlus className="size-4" />
				</div>
			)}
			<input
				ref={fileInputRef}
				type="file"
				accept={ACCEPTED_MIME_TYPES}
				className="hidden"
				onChange={handleFileChange}
			/>
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={handleClickUpload}
				disabled={isPending}
				className="gap-1.5"
			>
				<LuImagePlus className="size-4" />
				{iconUrl ? "Replace icon" : "Upload icon"}
			</Button>
			{hasGitHubRepo && (
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={handleUseGitHub}
					disabled={isPending}
					className="gap-1.5"
				>
					<LuGithub className="size-4" />
					Use GitHub icon
				</Button>
			)}
			{iconUrl && (
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={handleRemove}
					disabled={isPending}
					className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
				>
					<LuTrash2 className="size-4" />
					Remove
				</Button>
			)}
		</div>
	);
}
