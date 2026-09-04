import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
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
import { cloudTrpc } from "renderer/lib/cloud-trpc";

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
	const { t } = useLingui();
	const [isOpen, setIsOpen] = useState(false);
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [slugEdited, setSlugEdited] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const utils = cloudTrpc.useUtils();

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
				toast.error(
					result.error.message ??
						t({
							message: "Failed to create team",
						}),
				);
				return;
			}
			await utils.organization.listTeams.invalidate();
			toast.success(
				t({
					message: `Created team "${trimmedName}"`,
				}),
			);
			reset();
			setIsOpen(false);
		} catch (error) {
			toast.error(
				errorMessage(
					error,
					t({
						message: "Failed to create team",
					}),
				),
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<>
			<Button onClick={() => setIsOpen(true)}>
				<Trans>Create team</Trans>
			</Button>
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
							<DialogTitle>
								<Trans>Create a team</Trans>
							</DialogTitle>
							<DialogDescription>
								<Trans>
									Name and a URL-friendly slug. Both can be changed later.
								</Trans>
							</DialogDescription>
						</DialogHeader>
						<div className="my-4 space-y-4">
							<div className="space-y-1.5">
								<Label htmlFor="team-name">
									<Trans>Name</Trans>
								</Label>
								<Input
									id="team-name"
									value={name}
									onChange={(event) => handleNameChange(event.target.value)}
									placeholder={t({
										message: "e.g. Engineering",
									})}
									autoFocus
									required
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="team-slug">
									<Trans>Slug</Trans>
								</Label>
								<Input
									id="team-slug"
									value={slug}
									onChange={(event) => handleSlugChange(event.target.value)}
									placeholder={t({
										message: "e.g. engineering",
									})}
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
								<Trans>Cancel</Trans>
							</Button>
							<Button
								type="submit"
								disabled={!name.trim() || !slug.trim() || isSubmitting}
							>
								{isSubmitting ? (
									<Trans>Creating...</Trans>
								) : (
									<Trans>Create</Trans>
								)}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</>
	);
}
