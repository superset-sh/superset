import { Command, CommandItem, CommandList } from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useState } from "react";
import { HiCheck, HiChevronUpDown } from "react-icons/hi2";
import { LuFolderGit2, LuFolderOpen } from "react-icons/lu";
import { FormPickerTrigger } from "../FormPickerTrigger";

interface WorkspaceFolderPickerProps {
	/** True while the workspace is set to run in the project's own folder. */
	noWorktree: boolean;
	onChange: (noWorktree: boolean) => void;
}

/**
 * Picks the folder the new workspace runs in: a git worktree of its own, or
 * the folder the project itself lives in.
 *
 * The project folder is the same one the user has open in their editor, and
 * a project has exactly one workspace for it, so picking it opens that
 * workspace instead of creating another one.
 */
export function WorkspaceFolderPicker({
	noWorktree,
	onChange,
}: WorkspaceFolderPickerProps) {
	const [open, setOpen] = useState(false);

	const options = [
		{
			value: false,
			label: "New worktree",
			description: "A folder of its own, so the project folder is untouched.",
			icon: LuFolderGit2,
		},
		{
			value: true,
			label: "Project folder",
			description: "Work where the project already is. No worktree is added.",
			icon: LuFolderOpen,
		},
	];
	const selected = options.find((option) => option.value === noWorktree);
	const SelectedIcon = selected?.icon ?? LuFolderGit2;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<FormPickerTrigger className="max-w-full">
					<SelectedIcon className="size-3 shrink-0" />
					<span className="truncate">{selected?.label}</span>
					<HiChevronUpDown className="size-3 shrink-0" />
				</FormPickerTrigger>
			</PopoverTrigger>
			<PopoverContent className="w-[320px] p-0" align="start">
				<Command>
					<CommandList>
						{options.map((option) => {
							const OptionIcon = option.icon;
							return (
								<CommandItem
									key={option.label}
									value={option.label}
									onSelect={() => {
										onChange(option.value);
										setOpen(false);
									}}
									className="group items-start gap-3 rounded-md px-2.5 py-2"
								>
									<OptionIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
									<div className="flex min-w-0 flex-1 flex-col gap-0.5">
										<span className="truncate text-sm leading-snug">
											{option.label}
										</span>
										<span className="text-xs leading-snug text-muted-foreground">
											{option.description}
										</span>
									</div>
									{option.value === noWorktree && (
										<HiCheck className="mt-0.5 size-4 shrink-0" />
									)}
								</CommandItem>
							);
						})}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
