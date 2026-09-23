import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { DialogFooter } from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { LuLoaderCircle, LuPlus } from "react-icons/lu";
import type { SelectedFolder } from "../../MultiRepoProjectModal.utils";
import { SelectedFolderRow } from "./components/SelectedFolderRow";

interface MultiRepoProjectFormProps {
	name: string;
	folders: SelectedFolder[];
	/** Already attached to the project on the host, so no longer removable. */
	committedPaths: string[];
	failure: string | null;
	isWorking: boolean;
	isPicking: boolean;
	onNameChange: (name: string) => void;
	onAddFolder: () => void;
	onRemoveFolder: (path: string) => void;
	onCancel: () => void;
	onCreate: () => void;
}

export function MultiRepoProjectForm({
	name,
	folders,
	committedPaths,
	failure,
	isWorking,
	isPicking,
	onNameChange,
	onAddFolder,
	onRemoveFolder,
	onCancel,
	onCreate,
}: MultiRepoProjectFormProps) {
	const { t } = useLingui();
	const primaryFolder = folders[0];

	return (
		<>
			<div className="flex flex-col gap-4">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="multi-repo-project-name" className="text-xs">
						<Trans>Project name</Trans>
					</Label>
					<Input
						id="multi-repo-project-name"
						value={name}
						onChange={(event) => onNameChange(event.target.value)}
						placeholder={primaryFolder?.name ?? t({ message: "my-project" })}
						disabled={isWorking}
						autoFocus
					/>
				</div>

				<div className="flex flex-col gap-1.5">
					<Label className="text-xs">
						<Trans>Source folders</Trans>
					</Label>
					<div className="divide-y rounded-md border">
						{folders.map((folder) => (
							<SelectedFolderRow
								key={folder.path}
								folder={folder}
								isPrimary={folder.path === primaryFolder?.path}
								canRemove={!isWorking && !committedPaths.includes(folder.path)}
								onRemove={() => onRemoveFolder(folder.path)}
							/>
						))}
						{folders.length === 0 && (
							<p className="px-3 py-3 text-sm text-muted-foreground">
								<Trans>
									Add the repositories this project works across. The first one
									is the primary.
								</Trans>
							</p>
						)}
						<div className="px-3 py-2">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="gap-2"
								onClick={onAddFolder}
								disabled={isWorking || isPicking}
							>
								<LuPlus className="size-4" />
								<Trans>Add folder</Trans>
							</Button>
						</div>
					</div>
				</div>

				{failure && (
					<p
						role="alert"
						className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
					>
						{failure}
					</p>
				)}
			</div>

			<DialogFooter>
				<Button
					type="button"
					variant="ghost"
					onClick={onCancel}
					disabled={isWorking}
				>
					<Trans>Cancel</Trans>
				</Button>
				<Button
					type="button"
					onClick={onCreate}
					disabled={isWorking || folders.length === 0}
				>
					{isWorking ? (
						<>
							<LuLoaderCircle className="size-4 animate-spin" />
							<Trans>Creating…</Trans>
						</>
					) : (
						<Trans>Create project</Trans>
					)}
				</Button>
			</DialogFooter>
		</>
	);
}
