import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { ReactNode } from "react";
import {
	LuBot,
	LuChevronDown,
	LuCircleHelp,
	LuPencil,
	LuPlus,
} from "react-icons/lu";

interface FeatureHeaderProps {
	title: ReactNode;
	docsUrl: string;
	onCreate: () => void;
	isCreating: boolean;
	showCreate?: boolean;
	createMenuLabel?: ReactNode;
	createDescription?: ReactNode;
	secondaryAction?: {
		label: ReactNode;
		description?: ReactNode;
		onSelect: () => void;
		disabled: boolean;
	};
}

export function FeatureHeader({
	title,
	docsUrl,
	onCreate,
	isCreating,
	showCreate = true,
	createMenuLabel = <Trans>Create</Trans>,
	createDescription,
	secondaryAction,
}: FeatureHeaderProps) {
	const { t } = useLingui();
	return (
		<div className="flex flex-wrap items-center justify-between gap-3">
			<div className="flex items-center gap-1.5">
				<h1 className="font-semibold text-xl tracking-tight">{title}</h1>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							asChild
							variant="ghost"
							size="icon-xs"
							className="text-muted-foreground/60 hover:text-foreground"
						>
							<a
								href={docsUrl}
								target="_blank"
								rel="noopener noreferrer"
								aria-label={t({ message: "Documentation" })}
							>
								<LuCircleHelp className="size-3.5" />
							</a>
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						<Trans>Documentation</Trans>
					</TooltipContent>
				</Tooltip>
			</div>
			{showCreate &&
				(secondaryAction ? (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								size="sm"
								disabled={isCreating && secondaryAction.disabled}
							>
								<LuPlus className="size-3.5" />
								{createMenuLabel}
								<LuChevronDown className="size-3.5" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" sideOffset={6} className="w-64">
							<DropdownMenuItem
								className="items-start gap-2.5 p-2.5"
								disabled={secondaryAction.disabled}
								onSelect={secondaryAction.onSelect}
							>
								<LuPencil className="mt-0.5 size-4" />
								<span className="flex min-w-0 flex-col gap-0.5">
									{secondaryAction.label}
									{secondaryAction.description && (
										<span className="text-xs text-muted-foreground">
											{secondaryAction.description}
										</span>
									)}
								</span>
							</DropdownMenuItem>
							<DropdownMenuItem
								className="items-start gap-2.5 p-2.5"
								disabled={isCreating}
								onSelect={onCreate}
							>
								<LuBot className="mt-0.5 size-4" />
								<span className="flex min-w-0 flex-col gap-0.5">
									<Trans>Create with AI</Trans>
									{createDescription && (
										<span className="text-xs text-muted-foreground">
											{createDescription}
										</span>
									)}
								</span>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				) : (
					<Button size="sm" disabled={isCreating} onClick={onCreate}>
						<LuBot className="size-3.5" />
						<Trans>Create with AI</Trans>
					</Button>
				))}
		</div>
	);
}
