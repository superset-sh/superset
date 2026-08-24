"use client";

import { Building2, Check, ChevronDown, Lock } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "../../../ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../../../ui/dropdown-menu";
import { toast } from "../../../ui/sonner";
import { useFramePointerDown } from "../../hooks/useFramePointerDown";

export type PageVisibility = "just_me" | "org";

interface VisibilityOption {
	value: PageVisibility;
	label: string;
	hint: string;
	icon: typeof Lock;
}

const JUST_ME: VisibilityOption = {
	value: "just_me",
	label: "Just me",
	hint: "Only you can open this page",
	icon: Lock,
};

const TEAM: VisibilityOption = {
	value: "org",
	label: "Team",
	hint: "Anyone in your organization can open it",
	icon: Building2,
};

const OPTIONS: VisibilityOption[] = [JUST_ME, TEAM];

interface PageVisibilityMenuProps {
	visibility: PageVisibility;
	createdByUserId: string | null;
	currentUserId: string | undefined;
	onChange: (visibility: PageVisibility) => Promise<void>;
}

export function PageVisibilityMenu({
	visibility,
	createdByUserId,
	currentUserId,
	onChange,
}: PageVisibilityMenuProps) {
	const [open, setOpen] = useState(false);
	const [pending, setPending] = useState<PageVisibility | null>(null);
	const [busy, setBusy] = useState(false);
	const [lastSeen, setLastSeen] = useState(visibility);
	if (visibility !== lastSeen) {
		setLastSeen(visibility);
		setPending(null);
	}

	const current = pending ?? visibility;
	const active = current === "just_me" ? JUST_ME : TEAM;
	const ActiveIcon = active.icon;

	useFramePointerDown(useCallback(() => setOpen(false), []));

	const choose = async (next: PageVisibility) => {
		if (next === current || busy) return;
		setPending(next);
		setBusy(true);
		try {
			await onChange(next);
		} catch (error) {
			setPending(null);
			toast.error(
				error instanceof Error
					? error.message
					: "Could not change who can see this page",
			);
		} finally {
			setBusy(false);
		}
	};

	const editable =
		currentUserId !== undefined && currentUserId === createdByUserId;

	if (!editable) {
		return (
			<span className="flex shrink-0 items-center gap-1.5 text-muted-foreground text-xs">
				<ActiveIcon className="size-3.5" />
				{active.label}
			</span>
		);
	}

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					size="xs"
					variant="ghost"
					className="shrink-0 text-muted-foreground"
					disabled={busy}
				>
					<ActiveIcon className="size-3.5" />
					{active.label}
					<ChevronDown className="size-3" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				{OPTIONS.map((option) => (
					<DropdownMenuItem
						key={option.value}
						onSelect={() => {
							void choose(option.value);
						}}
						className="gap-2"
					>
						<option.icon className="size-4 text-muted-foreground" />
						<div className="flex min-w-0 flex-col">
							<span className="text-sm">{option.label}</span>
							<span className="text-muted-foreground text-xs">
								{option.hint}
							</span>
						</div>
						{option.value === current ? (
							<Check className="ml-auto size-4" />
						) : null}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
