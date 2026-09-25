"use client";

import { msg } from "@lingui/core/macro";
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
			title={i18n._(
				msg({
					message: "Actions",
				}),
			)}
			description={i18n._(
				msg({
					message: "Buttons, toggles, and keyboard affordances",
				}),
			)}
		>
			<ComponentCard
				title={i18n._(
					msg({
						message: "Button — variants",
					}),
				)}
				importPath="@superset/ui/button"
				description={i18n._(
					msg({
						message:
							"default · secondary · outline · ghost · link · destructive",
					}),
				)}
				span
			>
				<Button>
					<Trans>Default</Trans>
				</Button>
				<Button variant="secondary">
					<Trans>Secondary</Trans>
				</Button>
				<Button variant="outline">
					<Trans>Outline</Trans>
				</Button>
				<Button variant="ghost">
					<Trans>Ghost</Trans>
				</Button>
				<Button variant="link">
					<Trans>Link</Trans>
				</Button>
				<Button variant="destructive">
					<Trans>Destructive</Trans>
				</Button>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Button — sizes",
					}),
				)}
				importPath="@superset/ui/button"
				description={i18n._(
					msg({
						message: "xs · sm · default · lg · icon-xs → icon-lg",
					}),
				)}
				span
			>
				<Button size="xs" variant="outline">
					<Trans>Extra small</Trans>
				</Button>
				<Button size="sm" variant="outline">
					<Trans>Small</Trans>
				</Button>
				<Button variant="outline">
					<Trans>Default</Trans>
				</Button>
				<Button size="lg" variant="outline">
					<Trans>Large</Trans>
				</Button>
				<Button
					size="icon-xs"
					variant="outline"
					aria-label={i18n._(
						msg({
							message: "Add",
						}),
					)}
				>
					<PlusIcon />
				</Button>
				<Button
					size="icon-sm"
					variant="outline"
					aria-label={i18n._(
						msg({
							message: "Add",
						}),
					)}
				>
					<PlusIcon />
				</Button>
				<Button
					size="icon"
					variant="outline"
					aria-label={i18n._(
						msg({
							message: "Add",
						}),
					)}
				>
					<PlusIcon />
				</Button>
				<Button
					size="icon-lg"
					variant="outline"
					aria-label={i18n._(
						msg({
							message: "Add",
						}),
					)}
				>
					<PlusIcon />
				</Button>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Button — states",
					}),
				)}
				importPath="@superset/ui/button"
			>
				<Button disabled>
					<Trans>Disabled</Trans>
				</Button>
				<Button disabled>
					<Spinner />
					<Trans>Saving…</Trans>
				</Button>
				<Button variant="outline">
					<ArchiveIcon />
					<Trans>With icon</Trans>
				</Button>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Button Group",
					}),
				)}
				importPath="@superset/ui/button-group"
			>
				<ButtonGroup>
					<Button variant="outline">
						<Trans>Archive</Trans>
					</Button>
					<Button variant="outline">
						<Trans>Snooze</Trans>
					</Button>
					<ButtonGroupSeparator />
					<Button
						variant="outline"
						size="icon"
						aria-label={i18n._(
							msg({
								message: "Delete",
							}),
						)}
					>
						<TrashIcon />
					</Button>
				</ButtonGroup>
				<ButtonGroup>
					<ButtonGroupText>
						<Trans>https://</Trans>
					</ButtonGroupText>
					<Button variant="outline">
						<Trans>superset.sh</Trans>
					</Button>
					<Button
						variant="outline"
						size="icon"
						aria-label={i18n._(
							msg({
								message: "Expand",
							}),
						)}
					>
						<ChevronDownIcon />
					</Button>
				</ButtonGroup>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Toggle",
					}),
				)}
				importPath="@superset/ui/toggle"
			>
				<Toggle
					aria-label={i18n._(
						msg({
							message: "Toggle bold",
						}),
					)}
				>
					<BoldIcon />
				</Toggle>
				<Toggle
					variant="outline"
					aria-label={i18n._(
						msg({
							message: "Toggle italic",
						}),
					)}
				>
					<ItalicIcon />
				</Toggle>
				<Toggle variant="outline">
					<UnderlineIcon />
					<Trans>With label</Trans>
				</Toggle>
				<Toggle
					disabled
					aria-label={i18n._(
						msg({
							message: "Disabled toggle",
						}),
					)}
				>
					<Trans>Disabled</Trans>
				</Toggle>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Toggle Group",
					}),
				)}
				importPath="@superset/ui/toggle-group"
			>
				<ToggleGroup type="multiple" variant="outline">
					<ToggleGroupItem
						value="bold"
						aria-label={i18n._(
							msg({
								message: "Bold",
							}),
						)}
					>
						<BoldIcon />
					</ToggleGroupItem>
					<ToggleGroupItem
						value="italic"
						aria-label={i18n._(
							msg({
								message: "Italic",
							}),
						)}
					>
						<ItalicIcon />
					</ToggleGroupItem>
					<ToggleGroupItem
						value="underline"
						aria-label={i18n._(
							msg({
								message: "Underline",
							}),
						)}
					>
						<UnderlineIcon />
					</ToggleGroupItem>
				</ToggleGroup>
				<ToggleGroup type="single" defaultValue="week">
					<ToggleGroupItem value="day">
						<Trans>Day</Trans>
					</ToggleGroupItem>
					<ToggleGroupItem value="week">
						<Trans>Week</Trans>
					</ToggleGroupItem>
					<ToggleGroupItem value="month">
						<Trans>Month</Trans>
					</ToggleGroupItem>
				</ToggleGroup>
			</ComponentCard>

			<ComponentCard
				title={i18n._(
					msg({
						message: "Button patterns (in product)",
					}),
				)}
				importPath="@superset/ui/button"
				description={i18n._(
					msg({
						message:
							"Split button mirrors desktop's OpenInButton; picker trigger mirrors PickerTrigger",
					}),
				)}
				span
			>
				<ButtonGroup>
					<Button variant="outline" size="sm">
						<CodeIcon />
						<Trans>Open in Cursor</Trans>
					</Button>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="outline"
								size="icon-sm"
								aria-label={i18n._(
									msg({
										message: "Choose app",
									}),
								)}
							>
								<ChevronDownIcon />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem>
								<Trans>Cursor</Trans>
							</DropdownMenuItem>
							<DropdownMenuItem>
								<Trans>VS Code</Trans>
							</DropdownMenuItem>
							<DropdownMenuItem>
								<Trans>Terminal</Trans>
							</DropdownMenuItem>
							<DropdownMenuItem>
								<Trans>Copy path</Trans>
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
							<Trans>component-showcase</Trans>
						</span>
					</span>
					<ChevronsUpDownIcon className="size-3 shrink-0" />
				</Button>
			</ComponentCard>

			<ComponentCard
				title={i18n._(msg({ message: "Kbd" }))}
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
					<Trans>
						Press <Kbd>Esc</Kbd> to close
					</Trans>
				</span>
			</ComponentCard>
		</ShowcaseSection>
	);
}
