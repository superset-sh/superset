import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuLabel,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useUpdateProject } from "renderer/react-query/projects";
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

				<div className="space-y-1">
					<ContextMenuLabel className="text-xs text-muted-foreground">
						Color
					</ContextMenuLabel>
					<div className="space-y-0.5 px-2">
						{PROJECT_COLORS.map((color) => (
							<button
								key={color.value}
								type="button"
								onClick={() => {
									handleColorChange(color.value);
									inputRef.current?.focus();
								}}
								className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent ${
									color.value === projectColor ? "bg-accent" : ""
								}`}
							>
								<span
									className="size-4 rounded-full border border-border shadow-sm"
									style={{ backgroundColor: color.value }}
								/>
								<span className="text-sm text-foreground">{color.name}</span>
							</button>
						))}
					</div>
				</div>
			</ContextMenuContent>
		</ContextMenu>
	);
}
