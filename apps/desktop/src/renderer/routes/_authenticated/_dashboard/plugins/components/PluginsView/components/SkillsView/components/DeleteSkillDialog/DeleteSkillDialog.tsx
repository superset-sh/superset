import { Trans } from "@lingui/react/macro";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import type { SkillListItem } from "../../hooks/useSkills";

interface DeleteSkillDialogProps {
	skill: SkillListItem | null;
	isBusy: boolean;
	onClose: () => void;
	onConfirm: (skill: SkillListItem) => void;
}

export function DeleteSkillDialog({
	skill,
	isBusy,
	onClose,
	onConfirm,
}: DeleteSkillDialogProps) {
	return (
		<AlertDialog
			open={skill !== null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						<Trans>Delete {skill?.displayName}?</Trans>
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="flex flex-col gap-2">
							<p>
								<Trans>
									This removes the skill folder from disk. Agents stop seeing it
									in new sessions.
								</Trans>
							</p>
							{skill && (
								<ul className="font-mono text-xs break-all">
									{[skill.dir, ...skill.linkedFrom].map((path) => (
										<li key={path}>{path}</li>
									))}
								</ul>
							)}
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isBusy}>
						<Trans>Cancel</Trans>
					</AlertDialogCancel>
					<Button
						variant="destructive"
						disabled={isBusy}
						onClick={() => {
							if (skill) onConfirm(skill);
						}}
					>
						<Trans>Delete</Trans>
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
