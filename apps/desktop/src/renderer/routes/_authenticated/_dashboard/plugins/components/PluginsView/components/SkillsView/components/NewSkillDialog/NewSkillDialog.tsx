import { Trans, useLingui } from "@lingui/react/macro";
import {
	isValidSkillName,
	MAX_SKILL_NAME_LENGTH,
} from "@superset/shared/skills";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Textarea } from "@superset/ui/textarea";
import { useState } from "react";
import type {
	CreateSkillInput,
	SkillLocation,
} from "../../hooks/useSkillMutations";

interface NewSkillDialogProps {
	defaultLocation: SkillLocation;
	projects: { id: string; name: string }[];
	personalRoot: string | null;
	isBusy: boolean;
	onClose: () => void;
	onSubmit: (input: CreateSkillInput) => Promise<boolean>;
}

const PERSONAL = "personal";
const PROJECT_PREFIX = "project:";

function encodeLocation(location: SkillLocation): string {
	return location.scope === "personal"
		? PERSONAL
		: `${PROJECT_PREFIX}${location.projectId}`;
}

function decodeLocation(value: string): SkillLocation {
	return value === PERSONAL
		? { scope: "personal" }
		: { scope: "project", projectId: value.slice(PROJECT_PREFIX.length) };
}

function toNameInput(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/-{2,}/g, "-")
		.slice(0, MAX_SKILL_NAME_LENGTH);
}

/** Mount only while open: the fields reset by remounting. */
export function NewSkillDialog({
	defaultLocation,
	projects,
	personalRoot,
	isBusy,
	onClose,
	onSubmit,
}: NewSkillDialogProps) {
	const { t } = useLingui();
	const [location, setLocation] = useState(encodeLocation(defaultLocation));
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");

	const nameIsValid = isValidSkillName(name);
	const canSubmit = nameIsValid && description.trim() !== "" && !isBusy;
	const slug = name || "name";

	const handleSubmit = async () => {
		if (!canSubmit) return;
		const created = await onSubmit({
			...decodeLocation(location),
			name,
			description: description.trim(),
		});
		if (created) onClose();
	};

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>
						<Trans>New skill</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>
							A folder with a SKILL.md that every agent you use can load. You
							write the instructions next.
						</Trans>
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						void handleSubmit();
					}}
				>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="new-skill-location">
							<Trans>Location</Trans>
						</Label>
						<Select value={location} onValueChange={setLocation}>
							<SelectTrigger id="new-skill-location" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={PERSONAL}>
									<Trans>Personal</Trans>
									{personalRoot && (
										<span className="ml-2 font-mono text-xs text-muted-foreground">
											{personalRoot}
										</span>
									)}
								</SelectItem>
								{projects.map((project) => (
									<SelectItem
										key={project.id}
										value={`${PROJECT_PREFIX}${project.id}`}
									>
										{project.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="new-skill-name">
							<Trans>Name</Trans>
						</Label>
						<Input
							id="new-skill-name"
							autoFocus
							value={name}
							onChange={(event) => setName(toNameInput(event.target.value))}
							placeholder="release-notes"
							spellCheck={false}
							aria-invalid={name !== "" && !nameIsValid}
							className="h-8 font-mono text-sm"
						/>
						<p className="text-xs text-muted-foreground">
							{name !== "" && !nameIsValid ? (
								<Trans>
									Lowercase letters, numbers and single dashes only.
								</Trans>
							) : (
								<Trans>
									Agents invoke it as <code>/{slug}</code> in Claude Code or{" "}
									<code>${slug}</code> in Codex.
								</Trans>
							)}
						</p>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="new-skill-description">
							<Trans>Description</Trans>
						</Label>
						<Textarea
							id="new-skill-description"
							value={description}
							onChange={(event) => setDescription(event.target.value)}
							rows={3}
							placeholder={t({
								message: "What it does, and when an agent should reach for it",
							})}
							className="text-sm"
						/>
						<p className="text-xs text-muted-foreground">
							<Trans>
								Agents read this to decide when to use the skill, so say when it
								applies.
							</Trans>
						</p>
					</div>
					<DialogFooter className="flex-row justify-end gap-2">
						<Button type="button" variant="ghost" size="sm" onClick={onClose}>
							<Trans>Cancel</Trans>
						</Button>
						<Button type="submit" size="sm" disabled={!canSubmit}>
							<Trans>Create skill</Trans>
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
