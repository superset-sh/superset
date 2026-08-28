import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { useEffect, useState } from "react";
import { RankTeaser } from "./components/RankTeaser";
import type { LeaderboardPreview } from "./types";

const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){1,38}$/;

interface LeaderboardJoinDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	preview: LeaderboardPreview | null;
	suggestedHandle: string | null;
	isLoading: boolean;
	isJoining: boolean;
	onConfirm: (handle: string) => void;
}

export function LeaderboardJoinDialog({
	open,
	onOpenChange,
	preview,
	suggestedHandle,
	isLoading,
	isJoining,
	onConfirm,
}: LeaderboardJoinDialogProps) {
	const [handle, setHandle] = useState("");
	const [edited, setEdited] = useState(false);

	useEffect(() => {
		if (!edited && suggestedHandle) setHandle(suggestedHandle);
	}, [edited, suggestedHandle]);

	const trimmed = handle.trim().toLowerCase();
	const valid = HANDLE_PATTERN.test(trimmed);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Join the leaderboard</DialogTitle>
					<DialogDescription>
						Publishes your token counts and model names, never repo names, file
						paths or prompts. You can leave at any time, which deletes
						everything you've published.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					{isLoading ? (
						<p className="text-sm text-muted-foreground">
							Reading your local usage…
						</p>
					) : preview ? (
						<RankTeaser preview={preview} />
					) : null}

					<div className="space-y-1.5">
						<Label htmlFor="leaderboard-handle">Handle</Label>
						<Input
							id="leaderboard-handle"
							value={handle}
							onChange={(event) => {
								setEdited(true);
								setHandle(event.target.value);
							}}
							placeholder="pick a name for the board"
							autoComplete="off"
							spellCheck={false}
						/>
						<p className="text-xs text-muted-foreground">
							Shown publicly alongside your name.
						</p>
					</div>
				</div>

				<DialogFooter>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => onOpenChange(false)}
						disabled={isJoining}
					>
						Cancel
					</Button>
					<Button
						size="sm"
						disabled={!valid || isJoining}
						onClick={() => onConfirm(trimmed)}
					>
						{isJoining ? "Joining…" : "Join"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
