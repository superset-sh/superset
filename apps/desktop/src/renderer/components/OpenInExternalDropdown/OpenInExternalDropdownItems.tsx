import { Trans } from "@lingui/react/macro";
import type { AppRef } from "@superset/local-db";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LuAppWindow, LuCopy, LuPlus } from "react-icons/lu";
import jetbrainsIcon from "renderer/assets/app-icons/jetbrains.svg";
import terminalIcon from "renderer/assets/app-icons/terminal.png";
import vscodeIcon from "renderer/assets/app-icons/vscode.svg";
import { AppOptionIcon } from "./components/AppOptionIcon";
import {
	FINDER_OPTIONS,
	IDE_OPTIONS,
	JETBRAINS_OPTIONS,
	type OpenInExternalAppOption,
	TERMINAL_OPTIONS,
	VSCODE_OPTIONS,
} from "./constants";
import { useCustomApps } from "./useCustomApps";

export type OpenInExternalAppGroup =
	| "finder"
	| "ide"
	| "terminal"
	| "vscode"
	| "jetbrains"
	| "custom";

interface OpenInExternalDropdownItemsProps {
	isDark: boolean;
	activeApp?: AppRef;
	onOpenIn: (app: AppRef) => void;
	onCopyPath: () => void;
	renderAppTrailing?: (
		appId: AppRef,
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
	activeApp,
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
	const customApps = useCustomApps();
	const navigate = useNavigate();
	const addCustomApp = () =>
		navigate({ to: "/settings/links", search: { addApp: true } });
	const addCustomAppItem = (
		<DropdownMenuItem onClick={addCustomApp} className={appItemClassName}>
			<div className={cn("flex items-center gap-2", appContentClassName)}>
				<LuPlus className={cn("size-4", appIconClassName)} />
				<span className={cn("whitespace-nowrap", appLabelClassName)}>
					<Trans>Add custom app…</Trans>
				</span>
			</div>
		</DropdownMenuItem>
	);

	const renderAppOptions = (
		apps: OpenInExternalAppOption[],
		group: OpenInExternalAppGroup,
	) =>
		apps.map((app) => (
			<DropdownMenuItem
				key={app.id}
				onClick={() => onOpenIn(app.id)}
				className={appItemClassName}
			>
				<div className={cn("flex items-center gap-2", appContentClassName)}>
					<AppOptionIcon
						option={app}
						isDark={isDark}
						className={appIconClassName}
					/>
					<span className={appLabelClassName}>{app.label}</span>
				</div>
				{renderAppTrailing?.(app.id, group)}
			</DropdownMenuItem>
		));

	const activeIdeOption = activeApp
		? [...IDE_OPTIONS, ...VSCODE_OPTIONS, ...JETBRAINS_OPTIONS].find(
				(app) => app.id === activeApp,
			)
		: undefined;
	const activeTerminalOption = activeApp
		? TERMINAL_OPTIONS.find((app) => app.id === activeApp)
		: undefined;

	return (
		<>
			{renderAppOptions(FINDER_OPTIONS, "finder")}
			<DropdownMenuSub>
				<DropdownMenuSubTrigger className={subTriggerClassName}>
					<div
						className={cn(
							"flex items-center gap-2",
							subTriggerContentClassName,
						)}
					>
						<img
							src={
								activeIdeOption
									? isDark
										? activeIdeOption.darkIcon
										: activeIdeOption.lightIcon
									: vscodeIcon
							}
							alt=""
							className={cn("size-4 object-contain", subTriggerIconClassName)}
						/>
						<span>
							<Trans>IDE</Trans>
						</span>
					</div>
				</DropdownMenuSubTrigger>
				<DropdownMenuSubContent sideOffset={8} className={subContentClassName}>
					{renderAppOptions(IDE_OPTIONS, "ide")}
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
									className={cn(
										"size-4 object-contain",
										subTriggerIconClassName,
									)}
								/>
								<span>
									<Trans>VS Code</Trans>
								</span>
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
									className={cn(
										"size-4 object-contain",
										subTriggerIconClassName,
									)}
								/>
								<span>
									<Trans>JetBrains</Trans>
								</span>
							</div>
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent className={subContentClassName}>
							{renderAppOptions(JETBRAINS_OPTIONS, "jetbrains")}
						</DropdownMenuSubContent>
					</DropdownMenuSub>
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
							src={
								activeTerminalOption
									? isDark
										? activeTerminalOption.darkIcon
										: activeTerminalOption.lightIcon
									: terminalIcon
							}
							alt=""
							className={cn("size-4 object-contain", subTriggerIconClassName)}
						/>
						<span>
							<Trans>Terminal</Trans>
						</span>
					</div>
				</DropdownMenuSubTrigger>
				<DropdownMenuSubContent sideOffset={8} className={subContentClassName}>
					{renderAppOptions(TERMINAL_OPTIONS, "terminal")}
				</DropdownMenuSubContent>
			</DropdownMenuSub>
			{customApps.length === 0 ? (
				addCustomAppItem
			) : (
				<DropdownMenuSub>
					<DropdownMenuSubTrigger className={subTriggerClassName}>
						<div
							className={cn(
								"flex items-center gap-2",
								subTriggerContentClassName,
							)}
						>
							<LuAppWindow className={cn("size-4", subTriggerIconClassName)} />
							<span>
								<Trans>Custom</Trans>
							</span>
						</div>
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent
						sideOffset={8}
						className={subContentClassName}
					>
						{renderAppOptions(customApps, "custom")}
						<DropdownMenuSeparator />
						{addCustomAppItem}
					</DropdownMenuSubContent>
				</DropdownMenuSub>
			)}
			<DropdownMenuSeparator />
			<DropdownMenuItem onClick={onCopyPath} className={copyPathItemClassName}>
				<div
					className={cn("flex items-center gap-2", copyPathContentClassName)}
				>
					<LuCopy className={cn("size-4", copyPathIconClassName)} />
					<span className={copyPathLabelClassName}>
						<Trans>Copy path</Trans>
					</span>
				</div>
				{copyPathTrailing}
			</DropdownMenuItem>
		</>
	);
}
