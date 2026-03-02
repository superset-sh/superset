import type { ExternalApp } from "@superset/local-db";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { LuCopy } from "react-icons/lu";
import jetbrainsIcon from "renderer/assets/app-icons/jetbrains.svg";
import vscodeIcon from "renderer/assets/app-icons/vscode.svg";
import { APP_OPTIONS, JETBRAINS_OPTIONS, VSCODE_OPTIONS } from "./constants";

export type OpenInExternalAppGroup = "primary" | "vscode" | "jetbrains";

interface OpenInExternalDropdownItemsProps {
	isDark: boolean;
	onOpenIn: (app: ExternalApp) => void;
	onCopyPath: () => void;
	renderAppTrailing?: (
		appId: ExternalApp,
		group: OpenInExternalAppGroup,
	) => ReactNode;
	copyPathTrailing?: ReactNode;
	appItemClassName?: string;
	appContentClassName?: string;
	appIconClassName?: string;
	appLabelClassName?: string;
	subTriggerClassName?: string;
	subTriggerContentClassName?: string;
	subTriggerIconClassName?: string;
	subContentClassName?: string;
	copyPathItemClassName?: string;
	copyPathContentClassName?: string;
	copyPathIconClassName?: string;
	copyPathLabelClassName?: string;
}

export function OpenInExternalDropdownItems({
	isDark,
	onOpenIn,
	onCopyPath,
	renderAppTrailing,
	copyPathTrailing,
	appItemClassName,
	appContentClassName,
	appIconClassName,
	appLabelClassName,
	subTriggerClassName,
	subTriggerContentClassName,
	subTriggerIconClassName,
	subContentClassName,
	copyPathItemClassName,
	copyPathContentClassName,
	copyPathIconClassName,
	copyPathLabelClassName,
}: OpenInExternalDropdownItemsProps) {
	const renderAppOptions = (
		apps: typeof APP_OPTIONS,
		group: OpenInExternalAppGroup,
	) =>
		apps.map((app) => (
			<DropdownMenuItem
				key={app.id}
				onClick={() => onOpenIn(app.id)}
				className={appItemClassName}
			>
				<div className={cn("flex items-center gap-2", appContentClassName)}>
					<img
						src={isDark ? app.darkIcon : app.lightIcon}
						alt=""
						className={cn("size-4 object-contain", appIconClassName)}
					/>
					<span className={appLabelClassName}>{app.label}</span>
				</div>
				{renderAppTrailing?.(app.id, group)}
			</DropdownMenuItem>
		));

	return (
		<>
			{renderAppOptions(APP_OPTIONS, "primary")}
			<DropdownMenuSub>
				<DropdownMenuSubTrigger className={subTriggerClassName}>
					<div
						className={cn(
							"flex items-center gap-2",
							subTriggerContentClassName,
						)}
					>
						<img
							src={vscodeIcon}
							alt=""
							className={cn("size-4 object-contain", subTriggerIconClassName)}
						/>
						<span>VS Code</span>
					</div>
				</DropdownMenuSubTrigger>
				<DropdownMenuSubContent className={subContentClassName}>
					{renderAppOptions(VSCODE_OPTIONS, "vscode")}
				</DropdownMenuSubContent>
			</DropdownMenuSub>
			<DropdownMenuSub>
				<DropdownMenuSubTrigger className={subTriggerClassName}>
					<div
						className={cn(
							"flex items-center gap-2",
							subTriggerContentClassName,
						)}
					>
						<img
							src={jetbrainsIcon}
							alt=""
							className={cn("size-4 object-contain", subTriggerIconClassName)}
						/>
						<span>JetBrains</span>
					</div>
				</DropdownMenuSubTrigger>
				<DropdownMenuSubContent className={subContentClassName}>
					{renderAppOptions(JETBRAINS_OPTIONS, "jetbrains")}
				</DropdownMenuSubContent>
			</DropdownMenuSub>
			<DropdownMenuSeparator />
			<DropdownMenuItem onClick={onCopyPath} className={copyPathItemClassName}>
				<div
					className={cn("flex items-center gap-2", copyPathContentClassName)}
				>
					<LuCopy className={cn("size-4", copyPathIconClassName)} />
					<span className={copyPathLabelClassName}>Copy path</span>
				</div>
				{copyPathTrailing}
			</DropdownMenuItem>
		</>
	);
}
