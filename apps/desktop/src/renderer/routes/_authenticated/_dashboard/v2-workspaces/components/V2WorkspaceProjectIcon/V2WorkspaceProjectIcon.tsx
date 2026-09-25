import { cn } from "@superset/ui/utils";
import { useState } from "react";

interface V2WorkspaceProjectIconProps {
	projectName: string;
	/** Resolved icon URL (custom icon or GitHub avatar); null = show initial. */
	iconUrl: string | null;
	size?: "sm" | "md";
	className?: string;
}

const SIZE_CLASSES: Record<
	NonNullable<V2WorkspaceProjectIconProps["size"]>,
	string
> = {
	sm: "size-5 text-[10px]",
	md: "size-6 text-xs",
};

export function V2WorkspaceProjectIcon({
	projectName,
	iconUrl,
	size = "md",
	className,
}: V2WorkspaceProjectIconProps) {
	const [failedUrl, setFailedUrl] = useState<string | null>(null);
	const imageFailed = iconUrl != null && failedUrl === iconUrl;
	const dimensions = SIZE_CLASSES[size];
	const showImage = iconUrl != null && !imageFailed;

	if (showImage) {
		return (
			<div
				className={cn(
					"relative shrink-0 overflow-hidden rounded border border-border bg-muted",
					dimensions,
					className,
				)}
			>
				<img
					src={iconUrl}
					alt=""
					aria-hidden
					className="size-full object-cover"
					onError={() => setFailedUrl(iconUrl)}
				/>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"flex shrink-0 items-center justify-center rounded border border-border bg-muted font-medium text-muted-foreground",
				dimensions,
				className,
			)}
			aria-hidden
		>
			{projectName.charAt(0).toUpperCase() || "?"}
		</div>
	);
}
