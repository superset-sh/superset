import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { formatDistanceToNow } from "date-fns";
import { useCallback, useState } from "react";
import {
	HiEllipsisHorizontal,
	HiEye,
	HiEyeSlash,
	HiLockClosed,
	HiOutlineCodeBracket,
} from "react-icons/hi2";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

interface SecretRowProps {
	secret: {
		id: string;
		key: string;
		value: string;
		sensitive: boolean;
		createdAt: Date;
		updatedAt: Date;
	};
	organizationId: string;
	onEdit: () => void;
	onDeleted: () => void;
}

export function SecretRow({
	secret,
	organizationId,
	onEdit,
	onDeleted,
}: SecretRowProps) {
	const [isRevealed, setIsRevealed] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	const handleDelete = useCallback(async () => {
		if (!confirm(`Delete environment variable "${secret.key}"?`)) return;
		setIsDeleting(true);
		try {
			await apiTrpcClient.project.secrets.delete.mutate({
				id: secret.id,
				organizationId,
			});
			onDeleted();
		} catch (err) {
			console.error("[secrets/delete] Failed to delete:", err);
		} finally {
			setIsDeleting(false);
		}
	}, [secret.id, secret.key, organizationId, onDeleted]);

	const timeAgo = formatDistanceToNow(new Date(secret.createdAt), {
		addSuffix: true,
	});

	return (
		<div
			className={cn(
				"flex items-center justify-between px-4 py-3 border-b last:border-b-0 group hover:bg-accent/30 transition-colors",
				isDeleting && "opacity-50 pointer-events-none",
			)}
		>
			<div className="flex items-center gap-3 min-w-0 flex-1">
				{secret.sensitive ? (
					<HiLockClosed className="h-4 w-4 text-amber-500 shrink-0" />
				) : (
					<HiOutlineCodeBracket className="h-4 w-4 text-muted-foreground shrink-0" />
				)}
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span className="font-mono font-semibold text-sm truncate">
							{secret.key}
						</span>
						{secret.sensitive && (
							<span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 shrink-0">
								Sensitive
							</span>
						)}
					</div>
					<p className="text-xs text-muted-foreground mt-0.5">
						Added {timeAgo}
					</p>
				</div>
			</div>

			<div className="flex items-center gap-2 shrink-0">
				{secret.sensitive ? (
					<span className="text-xs text-muted-foreground italic">Hidden</span>
				) : (
					<div className="flex items-center gap-1.5">
						<button
							type="button"
							onClick={() => setIsRevealed(!isRevealed)}
							className="text-muted-foreground hover:text-foreground transition-colors p-1"
						>
							{isRevealed ? (
								<HiEyeSlash className="h-4 w-4" />
							) : (
								<HiEye className="h-4 w-4" />
							)}
						</button>
						<span className="font-mono text-sm text-muted-foreground max-w-[200px] truncate">
							{isRevealed
								? secret.value
								: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"}
						</span>
					</div>
				)}

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
						>
							<HiEllipsisHorizontal className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
						<DropdownMenuItem
							onClick={handleDelete}
							className="text-destructive focus:text-destructive"
						>
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}
