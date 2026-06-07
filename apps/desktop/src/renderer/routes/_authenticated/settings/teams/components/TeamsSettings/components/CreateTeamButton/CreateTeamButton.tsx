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
import { authClient } from "renderer/lib/auth-client";

interface CreateTeamButtonProps {
	organizationId: string;
}

function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function CreateTeamButton({ organizationId }: CreateTeamButtonProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [slugEdited, setSlugEdited] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);

	function handleNameChange(value: string) {
		setName(value);
		if (!slugEdited) setSlug(slugify(value));
	}

	function handleSlugChange(value: string) {
		setSlug(value);
		setSlugEdited(true);
	}

	function reset() {
		setName("");
		setSlug("");
		setSlugEdited(false);
	}

	async function handleSubmit(event: React.FormEvent) {
		event.preventDefault();
		const trimmedName = name.trim();
		const trimmedSlug = slug.trim();
		if (!trimmedName || !trimmedSlug) return;

		setIsSubmitting(true);
		try {
			const result = await authClient.organization.createTeam({
				name: trimmedName,
				slug: trimmedSlug,
				organizationId,
			});
			if (result.error) {
				toast.error(result.error.message ?? "Failed to create team");
				return;
			}
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
								Name and a URL-friendly slug. Both can be changed later.
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
								<Label htmlFor="team-slug">Slug</Label>
								<Input
									id="team-slug"
									value={slug}
									onChange={(event) => handleSlugChange(event.target.value)}
									placeholder="e.g. engineering"
									required
								/>
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
							<Button
								type="submit"
								disabled={!name.trim() || !slug.trim() || isSubmitting}
							>
								{isSubmitting ? "Creating..." : "Create"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</>
	);
}
