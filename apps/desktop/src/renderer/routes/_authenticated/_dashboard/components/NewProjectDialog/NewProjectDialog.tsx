import { Trans, useLingui } from "@lingui/react/macro";
import type { TaskProjectState } from "@superset/db/schema";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@superset/ui/dialog";
import { useRef, useState } from "react";
import { LuX } from "react-icons/lu";
import { ProjectIconPicker } from "renderer/routes/_authenticated/_dashboard/components/ProjectIconPicker";
import { ProjectPropertyChips } from "renderer/routes/_authenticated/_dashboard/components/ProjectPropertyChips";
import { TaskProjectIcon } from "renderer/routes/_authenticated/_dashboard/components/TaskProjectIcon";

export interface NewProject {
	name: string;
	description: string | null;
	icon: string | null;
	color: string | null;
	state: TaskProjectState;
	leadUserId: string | null;
	startDate: string | null;
	targetDate: string | null;
}

interface NewProjectDialogProps {
	open: boolean;
	initialName?: string;
	initialState?: TaskProjectState;
	people: { id: string; name: string; image: string | null }[];
	onInvite?: () => void;
	defaultLeadId: string | null;
	isCreating: boolean;
	onOpenChange: (open: boolean) => void;
	onCreate: (project: NewProject) => void;
}

export function NewProjectDialog({
	open,
	initialName = "",
	initialState = "planned",
	people,
	onInvite,
	defaultLeadId,
	isCreating,
	onOpenChange,
	onCreate,
}: NewProjectDialogProps) {
	const { t } = useLingui();
	const nameInputRef = useRef<HTMLInputElement>(null);
	const descriptionRef = useRef<HTMLTextAreaElement>(null);
	const [name, setName] = useState(initialName);
	const [description, setDescription] = useState("");
	const [icon, setIcon] = useState<string | null>(null);
	const [color, setColor] = useState<string | null>(null);
	const [state, setState] = useState<TaskProjectState>(initialState);
	const [leadUserId, setLeadUserId] = useState(defaultLeadId);
	const [startDate, setStartDate] = useState<string | null>(null);
	const [targetDate, setTargetDate] = useState<string | null>(null);
	const [seenInitialState, setSeenInitialState] = useState(initialState);
	if (initialState !== seenInitialState) {
		setSeenInitialState(initialState);
		setState(initialState);
	}
	const [seenInitialName, setSeenInitialName] = useState(initialName);
	if (initialName !== seenInitialName) {
		setSeenInitialName(initialName);
		setName(initialName);
	}
	const canCreate = name.trim().length > 0 && !isCreating;
	const create = () => {
		if (!canCreate) return;
		onCreate({
			name: name.trim(),
			description: description.trim() || null,
			icon,
			color,
			state,
			leadUserId,
			startDate,
			targetDate,
		});
	};
	const reset = () => {
		setName("");
		setDescription("");
		setIcon(null);
		setColor(null);
		setState("planned");
		setLeadUserId(defaultLeadId);
		setStartDate(null);
		setTargetDate(null);
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) reset();
				onOpenChange(next);
			}}
		>
			<DialogContent
				showCloseButton={false}
				className="flex flex-col gap-0 overflow-hidden bg-popover p-0 text-popover-foreground sm:max-w-[560px]"
				onKeyDown={(event) => {
					if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
						event.preventDefault();
						create();
					}
				}}
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					nameInputRef.current?.focus();
				}}
			>
				<div className="flex items-center justify-between px-4 pt-3">
					<DialogTitle className="text-sm font-medium text-muted-foreground">
						<Trans>New project</Trans>
					</DialogTitle>
					<DialogDescription className="sr-only">
						<Trans>Create a project to group tasks and cloud workspaces.</Trans>
					</DialogDescription>
					<DialogClose asChild>
						<button
							type="button"
							disabled={isCreating}
							aria-label={t({ message: "Close" })}
							className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-fill-hover hover:text-foreground"
						>
							<LuX className="size-4" />
						</button>
					</DialogClose>
				</div>
				<div className="px-4 pt-3 pb-4">
					<div className="flex items-center gap-2">
						<ProjectIconPicker
							icon={icon}
							color={color}
							onChange={(next) => {
								setIcon(next.icon);
								setColor(next.color);
							}}
						>
							<button
								type="button"
								aria-label={t({ message: "Icon" })}
								className="flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-fill-hover"
							>
								<TaskProjectIcon icon={icon} color={color} className="size-5" />
							</button>
						</ProjectIconPicker>
						<input
							ref={nameInputRef}
							type="text"
							value={name}
							onChange={(event) => setName(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter" && !event.metaKey && !event.ctrlKey) {
									event.preventDefault();
									descriptionRef.current?.focus();
								}
							}}
							placeholder={t({ message: "Project name" })}
							className="min-w-0 flex-1 bg-transparent text-xl font-semibold outline-none placeholder:text-muted-foreground/60"
						/>
					</div>
					<textarea
						ref={descriptionRef}
						value={description}
						onChange={(event) => setDescription(event.target.value)}
						rows={2}
						placeholder={t({ message: "Add a short summary…" })}
						className="field-sizing-content mt-2 max-h-48 min-h-12 w-full resize-none bg-transparent pl-10 text-sm outline-none placeholder:text-muted-foreground/60"
					/>
					<div className="mt-3 pl-10">
						<ProjectPropertyChips
							value={{ state, leadUserId, startDate, targetDate }}
							people={people}
							onInvite={onInvite}
							onChange={(changes) => {
								if (changes.state) setState(changes.state);
								if (changes.leadUserId !== undefined)
									setLeadUserId(changes.leadUserId);
								if (changes.startDate !== undefined)
									setStartDate(changes.startDate);
								if (changes.targetDate !== undefined)
									setTargetDate(changes.targetDate);
							}}
						/>
					</div>
				</div>
				<div className="flex justify-end border-t px-4 py-3">
					<Button size="sm" onClick={create} disabled={!canCreate}>
						{isCreating ? (
							<Trans>Creating...</Trans>
						) : (
							<Trans>Create project</Trans>
						)}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
