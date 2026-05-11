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
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import {
	normalizeTeamKey,
	TEAM_KEY_MAX_LENGTH,
} from "../../../../utils/team-key";

export function CreateTeamButton() {
	const [isOpen, setIsOpen] = useState(false);
	const [name, setName] = useState("");
	const [key, setKey] = useState("");
	const [keyEdited, setKeyEdited] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);

	function handleNameChange(value: string) {
		setName(value);
		if (!keyEdited) {
			setKey(normalizeTeamKey(value).slice(0, TEAM_KEY_MAX_LENGTH));
		}
	}

	function handleKeyChange(value: string) {
		setKey(normalizeTeamKey(value).slice(0, TEAM_KEY_MAX_LENGTH));
		setKeyEdited(true);
	}

	function reset() {
		setName("");
		setKey("");
		setKeyEdited(false);
	}

	const trimmedName = name.trim();
	const canSubmit = trimmedName.length > 0 && key.length >= 3 && !isSubmitting;

	async function handleSubmit(event: React.FormEvent) {
		event.preventDefault();
		if (!canSubmit) return;

		setIsSubmitting(true);
		try {
			await apiTrpcClient.team.create.mutate({ name: trimmedName, key });
			toast.success(`Created team "${trimmedName}"`);
			reset();
			setIsOpen(false);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to create team",
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<>
			<Button onClick={() => setIsOpen(true)}>Create team</Button>
			<Dialog
				open={isOpen}
				onOpenChange={(open) => {
					setIsOpen(open);
					if (!open) reset();
				}}
			>
				<DialogContent>
					<form onSubmit={handleSubmit}>
						<DialogHeader>
							<DialogTitle>Create a team</DialogTitle>
							<DialogDescription>
								Pick a name and an identifier. Both can be changed later.
							</DialogDescription>
						</DialogHeader>
						<div className="my-4 space-y-4">
							<div className="space-y-1.5">
								<Label htmlFor="team-name">Name</Label>
								<Input
									id="team-name"
									value={name}
									onChange={(event) => handleNameChange(event.target.value)}
									placeholder="e.g. Engineering"
									autoFocus
									required
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="team-key">Identifier</Label>
								<Input
									id="team-key"
									value={key}
									onChange={(event) => handleKeyChange(event.target.value)}
									placeholder="e.g. ENG"
									maxLength={TEAM_KEY_MAX_LENGTH}
									required
								/>
								<p className="text-xs text-muted-foreground">
									Used in task IDs.
								</p>
							</div>
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="ghost"
								onClick={() => setIsOpen(false)}
								disabled={isSubmitting}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={!canSubmit}>
								{isSubmitting ? "Creating..." : "Create"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</>
	);
}
