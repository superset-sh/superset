import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { ButtonGroup } from "@superset/ui/button-group";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { ReactNode } from "react";
import {
	LuChevronDown,
	LuCircleHelp,
	LuPlus,
	LuSparkles,
} from "react-icons/lu";

interface FeatureHeaderProps {
	title: ReactNode;
	docsUrl: string;
	onCreate: () => void;
	isCreating: boolean;
	showCreate?: boolean;
	createDescription?: ReactNode;
	primaryAction?: {
		label: ReactNode;
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
	createDescription,
	primaryAction,
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
				(primaryAction ? (
					<ButtonGroup>
						<Button
							size="sm"
							disabled={primaryAction.disabled}
							onClick={primaryAction.onSelect}
						>
							<LuPlus className="size-3.5" />
							{primaryAction.label}
						</Button>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									size="sm"
									className="px-2"
									aria-label={t({ message: "More create options" })}
								>
									<LuChevronDown className="size-3.5" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" sideOffset={6} className="w-64">
								<DropdownMenuItem
									className="items-start gap-2.5 p-2.5"
									disabled={isCreating}
									onSelect={onCreate}
								>
									<LuSparkles className="mt-0.5 size-4" />
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
					</ButtonGroup>
				) : (
					<Button size="sm" disabled={isCreating} onClick={onCreate}>
						<LuSparkles className="size-3.5" />
						<Trans>Create with AI</Trans>
					</Button>
				))}
		</div>
	);
}
