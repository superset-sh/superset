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

interface FactoryNewWorkDialogProps {
	open: boolean;
	pending: boolean;
	onOpenChange: (open: boolean) => void;
	onCreate: (title: string) => Promise<void>;
}

export function FactoryNewWorkDialog({
	open,
	pending,
	onOpenChange,
	onCreate,
}: FactoryNewWorkDialogProps) {
	const [title, setTitle] = useState("");

	useEffect(() => {
		if (!open) setTitle("");
	}, [open]);

	const handleCreate = async () => {
		const normalizedTitle = title.trim();
		if (!normalizedTitle) return;
		await onCreate(normalizedTitle);
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Add a request</DialogTitle>
					<DialogDescription>
						Capture work directly in Intake. Factory keeps the request attached
						to every agent, worktree, decision, and pull request that follows.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-2 py-2">
					<Label htmlFor="factory-request-title">
						What should Factory ship?
					</Label>
					<Input
						id="factory-request-title"
						value={title}
						maxLength={180}
						autoFocus
						placeholder="Fix workspace scroll position after remount"
						onChange={(event) => setTitle(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && !event.nativeEvent.isComposing) {
								event.preventDefault();
								void handleCreate();
							}
						}}
					/>
					<p className="text-xs text-muted-foreground">
						You will approve the plan before Factory changes code.
					</p>
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={pending}
					>
						Keep browsing
					</Button>
					<Button
						onClick={() => void handleCreate()}
						disabled={pending || title.trim().length === 0}
					>
						{pending ? "Adding request…" : "Add to Intake"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
