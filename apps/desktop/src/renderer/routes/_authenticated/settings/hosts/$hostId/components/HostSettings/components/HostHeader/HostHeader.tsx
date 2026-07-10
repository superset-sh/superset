import { cn } from "@superset/ui/utils";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LuPencil } from "react-icons/lu";
import { useOptimisticCollectionActions } from "renderer/routes/_authenticated/hooks/useOptimisticCollectionActions";

interface HostHeaderProps {
	name: string;
	isOnline: boolean;
	machineId: string;
	canRename: boolean;
}

export function HostHeader({
	name,
	isOnline,
	machineId,
	canRename,
}: HostHeaderProps) {
	const { v2Hosts: hostActions } = useOptimisticCollectionActions();
	const [isEditing, setIsEditing] = useState(false);
	const [draft, setDraft] = useState(name);
	const inputRef = useRef<HTMLInputElement>(null);
	const cancelledRef = useRef(false);

	useEffect(() => {
		if (!isEditing) setDraft(name);
	}, [name, isEditing]);

	useLayoutEffect(() => {
		if (isEditing) {
			cancelledRef.current = false;
			inputRef.current?.focus();
			inputRef.current?.select();
		}
	}, [isEditing]);

	const commit = () => {
		if (cancelledRef.current) {
			cancelledRef.current = false;
			return;
		}
		const trimmed = draft.trim();
		setIsEditing(false);
		if (!trimmed || trimmed === name) {
			setDraft(name);
			return;
		}
		hostActions.renameHost(machineId, trimmed);
	};

	const cancel = () => {
		cancelledRef.current = true;
		setDraft(name);
		setIsEditing(false);
	};

	return (
		<div className="mb-8">
			<div className="flex items-center gap-2">
				<span
					className={cn(
						"size-2 rounded-full",
						isOnline ? "bg-emerald-500" : "bg-muted-foreground/40",
					)}
				/>
				{isEditing ? (
					<label className="inline-grid text-xl font-semibold -my-px leading-[1.6875rem]">
						<span
							aria-hidden
							className="invisible col-start-1 row-start-1 whitespace-pre"
						>
							{draft || " "}
						</span>
						<input
							ref={inputRef}
							aria-label="Host name"
							size={1}
							className="col-start-1 row-start-1 bg-transparent border-b border-border outline-none focus:border-foreground w-full p-0"
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
							onBlur={commit}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									commit();
								}
								if (e.key === "Escape") {
									e.preventDefault();
									cancel();
								}
							}}
						/>
					</label>
				) : canRename ? (
					<button
						type="button"
						onClick={() => setIsEditing(true)}
						className="flex items-center gap-2 text-left hover:text-foreground"
						title="Rename host"
					>
						<h2 className="text-xl font-semibold">{name}</h2>
						<LuPencil className="size-4 text-muted-foreground" />
					</button>
				) : (
					<h2 className="text-xl font-semibold">{name}</h2>
				)}
			</div>
			<p className="text-sm text-muted-foreground mt-1">
				{isOnline ? "Online" : "Offline"} ·{" "}
				<span className="font-mono">{machineId}</span>
			</p>
		</div>
	);
}
