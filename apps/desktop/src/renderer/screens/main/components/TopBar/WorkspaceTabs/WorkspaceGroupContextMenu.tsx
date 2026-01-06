import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
	useCloseProject,
	useUpdateProject,
} from "renderer/react-query/projects";
import { PROJECT_COLORS } from "shared/constants/project-colors";

interface WorkspaceGroupContextMenuProps {
	projectId: string;
	projectName: string;
	projectColor: string;
	children: ReactNode;
}

export function WorkspaceGroupContextMenu({
	projectId,
	projectName,
	projectColor,
	children,
}: WorkspaceGroupContextMenuProps) {
	const [name, setName] = useState(projectName);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const skipBlurSubmit = useRef(false);
	const updateProject = useUpdateProject();
	const closeProject = useCloseProject();

	useEffect(() => {
		setName(projectName);
	}, [projectName]);

	const handleOpenChange = (open: boolean) => {
		if (open) {
			// Small delay to ensure the menu is fully rendered
			setTimeout(() => {
				inputRef.current?.focus();
				inputRef.current?.select();
			}, 0);
		}
	};

	const submitName = () => {
		const trimmed = name.trim();

		if (!trimmed) {
			setName(projectName);
			return;
		}

		if (trimmed !== name) {
			setName(trimmed);
		}

		if (trimmed !== projectName) {
			updateProject.mutate({
				id: projectId,
				patch: { name: trimmed },
			});
		}
	};

	const handleNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Enter") {
			event.preventDefault();
			skipBlurSubmit.current = true;
			submitName();
			inputRef.current?.blur();
		} else if (event.key === "Escape") {
			event.preventDefault();
			setName(projectName);
			skipBlurSubmit.current = true;
			inputRef.current?.blur();
		}
	};

	const handleBlur = () => {
		if (skipBlurSubmit.current) {
			skipBlurSubmit.current = false;
			return;
		}

		submitName();
	};

	const handleColorChange = (color: string) => {
		if (color === projectColor) {
			return;
		}

		updateProject.mutate({
			id: projectId,
			patch: { color },
		});
	};

	return (
		<ContextMenu onOpenChange={handleOpenChange}>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent className="w-64 space-y-2">
				<div
					className="space-y-1.5 px-2 pt-1.5"
					onPointerMove={(event) => event.stopPropagation()}
					onPointerDown={(event) => event.stopPropagation()}
				>
					<p className="text-xs text-muted-foreground">Workspace group name</p>
					<input
						ref={inputRef}
						value={name}
						onChange={(event) => setName(event.target.value)}
						onBlur={handleBlur}
						onKeyDown={handleNameKeyDown}
						className="w-full rounded-md border border-border bg-muted/50 px-2 py-1 text-sm text-foreground outline-none focus:border-primary focus:bg-background"
						placeholder="Workspace group"
					/>
				</div>

				<ContextMenuSeparator />

				<div className="flex gap-2 overflow-x-auto px-2 py-1.5">
					{PROJECT_COLORS.map((color) => (
						<button
							key={color.value}
							type="button"
							onClick={() => {
								handleColorChange(color.value);
								inputRef.current?.focus();
							}}
							className={`shrink-0 rounded-full p-0.5 transition-all ${
								color.value === projectColor
									? "ring-2 ring-primary ring-offset-2 ring-offset-background"
									: "hover:ring-2 hover:ring-muted-foreground/50 hover:ring-offset-2 hover:ring-offset-background"
							}`}
						>
							<span
								className="block size-5 rounded-full border border-border shadow-sm"
								style={{ backgroundColor: color.value }}
							/>
						</button>
					))}
				</div>

				<ContextMenuSeparator />

				<button
					type="button"
					onClick={() => {
						closeProject.mutate({ id: projectId });
					}}
					className="w-full px-2 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
				>
					Close Project
				</button>
			</ContextMenuContent>
		</ContextMenu>
	);
}
