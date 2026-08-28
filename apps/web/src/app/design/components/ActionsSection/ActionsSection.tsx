"use client";

import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { Button } from "@superset/ui/button";
import {
	ButtonGroup,
	ButtonGroupSeparator,
	ButtonGroupText,
} from "@superset/ui/button-group";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { Spinner } from "@superset/ui/spinner";
import { Toggle } from "@superset/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@superset/ui/toggle-group";
import {
	ArchiveIcon,
	BoldIcon,
	ChevronDownIcon,
	ChevronsUpDownIcon,
	CodeIcon,
	FolderGitIcon,
	ItalicIcon,
	PlusIcon,
	TrashIcon,
	UnderlineIcon,
} from "lucide-react";

import { ComponentCard } from "../ComponentCard";
import { ShowcaseSection } from "../ShowcaseSection";

export function ActionsSection() {
	return (
		<ShowcaseSection
			id="actions"
			index="01"
			title={i18n._({
				id: "web.design.actionsSection.actions",
				message: "Actions",
			})}
			description={i18n._({
				id: "web.design.actionsSection.buttonsTogglesAndKeyboardAffordances",
				message: "Buttons, toggles, and keyboard affordances",
			})}
		>
			<ComponentCard
				title={i18n._({
					id: "web.design.actionsSection.buttonVariants",
					message: "Button — variants",
				})}
				importPath="@superset/ui/button"
				description={i18n._({
					id: "web.design.actionsSection.defaultSecondaryOutlineGhostLink",
					message: "default · secondary · outline · ghost · link · destructive",
				})}
				span
			>
				<Button>
					<Trans id="web.design.actionsSection.default">Default</Trans>
				</Button>
				<Button variant="secondary">
					<Trans id="web.design.actionsSection.secondary">Secondary</Trans>
				</Button>
				<Button variant="outline">
					<Trans id="web.design.actionsSection.outline">Outline</Trans>
				</Button>
				<Button variant="ghost">
					<Trans id="web.design.actionsSection.ghost">Ghost</Trans>
				</Button>
				<Button variant="link">
					<Trans id="web.design.actionsSection.link">Link</Trans>
				</Button>
				<Button variant="destructive">
					<Trans id="web.design.actionsSection.destructive">Destructive</Trans>
				</Button>
			</ComponentCard>

			<ComponentCard
				title={i18n._({
					id: "web.design.actionsSection.buttonSizes",
					message: "Button — sizes",
				})}
				importPath="@superset/ui/button"
				description={i18n._({
					id: "web.design.actionsSection.xsSmDefaultLgIcon",
					message: "xs · sm · default · lg · icon-xs → icon-lg",
				})}
				span
			>
				<Button size="xs" variant="outline">
					<Trans id="web.design.actionsSection.extraSmall">Extra small</Trans>
				</Button>
				<Button size="sm" variant="outline">
					<Trans id="web.design.actionsSection.small">Small</Trans>
				</Button>
				<Button variant="outline">
					<Trans id="web.design.actionsSection.default">Default</Trans>
				</Button>
				<Button size="lg" variant="outline">
					<Trans id="web.design.actionsSection.large">Large</Trans>
				</Button>
				<Button
					size="icon-xs"
					variant="outline"
					aria-label={i18n._({
						id: "web.design.actionsSection.add",
						message: "Add",
					})}
				>
					<PlusIcon />
				</Button>
				<Button
					size="icon-sm"
					variant="outline"
					aria-label={i18n._({
						id: "web.design.actionsSection.add",
						message: "Add",
					})}
				>
					<PlusIcon />
				</Button>
				<Button
					size="icon"
					variant="outline"
					aria-label={i18n._({
						id: "web.design.actionsSection.add",
						message: "Add",
					})}
				>
					<PlusIcon />
				</Button>
				<Button
					size="icon-lg"
					variant="outline"
					aria-label={i18n._({
						id: "web.design.actionsSection.add",
						message: "Add",
					})}
				>
					<PlusIcon />
				</Button>
			</ComponentCard>

			<ComponentCard
				title={i18n._({
					id: "web.design.actionsSection.buttonStates",
					message: "Button — states",
				})}
				importPath="@superset/ui/button"
			>
				<Button disabled>
					<Trans id="web.design.actionsSection.disabled">Disabled</Trans>
				</Button>
				<Button disabled>
					<Spinner />
					<Trans id="web.design.actionsSection.saving">Saving…</Trans>
				</Button>
				<Button variant="outline">
					<ArchiveIcon />
					<Trans id="web.design.actionsSection.withIcon">With icon</Trans>
				</Button>
			</ComponentCard>

			<ComponentCard
				title={i18n._({
					id: "web.design.actionsSection.buttonGroup",
					message: "Button Group",
				})}
				importPath="@superset/ui/button-group"
			>
				<ButtonGroup>
					<Button variant="outline">
						<Trans id="web.design.actionsSection.archive">Archive</Trans>
					</Button>
					<Button variant="outline">
						<Trans id="web.design.actionsSection.snooze">Snooze</Trans>
					</Button>
					<ButtonGroupSeparator />
					<Button
						variant="outline"
						size="icon"
						aria-label={i18n._({
							id: "web.design.actionsSection.delete",
							message: "Delete",
						})}
					>
						<TrashIcon />
					</Button>
				</ButtonGroup>
				<ButtonGroup>
					<ButtonGroupText>
						<Trans id="web.design.actionsSection.https">https://</Trans>
					</ButtonGroupText>
					<Button variant="outline">
						<Trans id="web.design.actionsSection.supersetSh">superset.sh</Trans>
					</Button>
					<Button
						variant="outline"
						size="icon"
						aria-label={i18n._({
							id: "web.design.actionsSection.expand",
							message: "Expand",
						})}
					>
						<ChevronDownIcon />
					</Button>
				</ButtonGroup>
			</ComponentCard>

			<ComponentCard
				title={i18n._({
					id: "web.design.actionsSection.toggle",
					message: "Toggle",
				})}
				importPath="@superset/ui/toggle"
			>
				<Toggle
					aria-label={i18n._({
						id: "web.design.actionsSection.toggleBold",
						message: "Toggle bold",
					})}
				>
					<BoldIcon />
				</Toggle>
				<Toggle
					variant="outline"
					aria-label={i18n._({
						id: "web.design.actionsSection.toggleItalic",
						message: "Toggle italic",
					})}
				>
					<ItalicIcon />
				</Toggle>
				<Toggle variant="outline">
					<UnderlineIcon />
					<Trans id="web.design.actionsSection.withLabel">With label</Trans>
				</Toggle>
				<Toggle
					disabled
					aria-label={i18n._({
						id: "web.design.actionsSection.disabledToggle",
						message: "Disabled toggle",
					})}
				>
					<Trans id="web.design.actionsSection.disabled">Disabled</Trans>
				</Toggle>
			</ComponentCard>

			<ComponentCard
				title={i18n._({
					id: "web.design.actionsSection.toggleGroup",
					message: "Toggle Group",
				})}
				importPath="@superset/ui/toggle-group"
			>
				<ToggleGroup type="multiple" variant="outline">
					<ToggleGroupItem
						value="bold"
						aria-label={i18n._({
							id: "web.design.actionsSection.bold",
							message: "Bold",
						})}
					>
						<BoldIcon />
					</ToggleGroupItem>
					<ToggleGroupItem
						value="italic"
						aria-label={i18n._({
							id: "web.design.actionsSection.italic",
							message: "Italic",
						})}
					>
						<ItalicIcon />
					</ToggleGroupItem>
					<ToggleGroupItem
						value="underline"
						aria-label={i18n._({
							id: "web.design.actionsSection.underline",
							message: "Underline",
						})}
					>
						<UnderlineIcon />
					</ToggleGroupItem>
				</ToggleGroup>
				<ToggleGroup type="single" defaultValue="week">
					<ToggleGroupItem value="day">
						<Trans id="web.design.actionsSection.day">Day</Trans>
					</ToggleGroupItem>
					<ToggleGroupItem value="week">
						<Trans id="web.design.actionsSection.week">Week</Trans>
					</ToggleGroupItem>
					<ToggleGroupItem value="month">
						<Trans id="web.design.actionsSection.month">Month</Trans>
					</ToggleGroupItem>
				</ToggleGroup>
			</ComponentCard>

			<ComponentCard
				title={i18n._({
					id: "web.design.actionsSection.buttonPatternsInProduct",
					message: "Button patterns (in product)",
				})}
				importPath="@superset/ui/button"
				description={i18n._({
					id: "web.design.actionsSection.splitButtonMirrorsDesktopS",
					message:
						"Split button mirrors desktop's OpenInButton; picker trigger mirrors PickerTrigger",
				})}
				span
			>
				<ButtonGroup>
					<Button variant="outline" size="sm">
						<CodeIcon />
						<Trans id="web.design.actionsSection.openInCursor">
							Open in Cursor
						</Trans>
					</Button>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="outline"
								size="icon-sm"
								aria-label={i18n._({
									id: "web.design.actionsSection.chooseApp",
									message: "Choose app",
								})}
							>
								<ChevronDownIcon />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem>
								<Trans id="web.design.actionsSection.cursor">Cursor</Trans>
							</DropdownMenuItem>
							<DropdownMenuItem>
								<Trans id="web.design.actionsSection.vsCode">VS Code</Trans>
							</DropdownMenuItem>
							<DropdownMenuItem>
								<Trans id="web.design.actionsSection.terminal">Terminal</Trans>
							</DropdownMenuItem>
							<DropdownMenuItem>
								<Trans id="web.design.actionsSection.copyPath">Copy path</Trans>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</ButtonGroup>
				<Button
					variant="ghost"
					className="max-w-48 justify-between gap-1 px-2 text-xs"
				>
					<span className="flex min-w-0 flex-1 items-center gap-1.5">
						<FolderGitIcon className="size-3.5 shrink-0" />
						<span className="truncate text-left">
							<Trans id="web.design.actionsSection.componentShowcase">
								component-showcase
							</Trans>
						</span>
					</span>
					<ChevronsUpDownIcon className="size-3 shrink-0" />
				</Button>
			</ComponentCard>

			<ComponentCard
				title={i18n._({ id: "web.design.actionsSection.kbd", message: "Kbd" })}
				importPath="@superset/ui/kbd"
				span
			>
				<KbdGroup>
					<Kbd>⌘</Kbd>
					<Kbd>K</Kbd>
				</KbdGroup>
				<KbdGroup>
					<Kbd>⌘</Kbd>
					<Kbd>⇧</Kbd>
					<Kbd>P</Kbd>
				</KbdGroup>
				<span className="text-sm text-muted-foreground">
					<Trans id="web.design.actionsSection.pressEscToClose">
						Press <Kbd>Esc</Kbd> to close
					</Trans>
				</span>
			</ComponentCard>
		</ShowcaseSection>
	);
}
