import { useState } from "react";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { ScrollArea } from "@superbuilder/feature-ui/shadcn/scroll-area";
import { SearchIcon } from "lucide-react";

import { AccordionCard } from "./(cards)/-accordion-card";
import { AlertDialogCard } from "./(cards)/-alert-dialog-card";
import { AvatarCard } from "./(cards)/-avatar-card";
import { BadgeCard } from "./(cards)/-badge-card";
import { BreadcrumbCard } from "./(cards)/-breadcrumb-card";
import { ButtonCard } from "./(cards)/-button-card";
import { ButtonGroupCard } from "./(cards)/-button-group-card";
import { CardCard } from "./(cards)/-card-card";
import { CheckboxCard } from "./(cards)/-checkbox-card";
import { CommandCard } from "./(cards)/-command-card";
import { ContextMenuCard } from "./(cards)/-context-menu-card";
import { DialogCard } from "./(cards)/-dialog-card";
import { DrawerCard } from "./(cards)/-drawer-card";
import { DropdownMenuCard } from "./(cards)/-dropdown-menu-card";
import { FieldCard } from "./(cards)/-field-card";
import { InputCard } from "./(cards)/-input-card";
import { InputGroupCard } from "./(cards)/-input-group-card";
import { ItemCard } from "./(cards)/-item-card";
import { KbdCard } from "./(cards)/-kbd-card";
import { LabelCard } from "./(cards)/-label-card";
import { MenubarCard } from "./(cards)/-menubar-card";
import { PopoverCard } from "./(cards)/-popover-card";
import { ProgressCard } from "./(cards)/-progress-card";
import { RadioGroupCard } from "./(cards)/-radio-group-card";
import { ResizableCard } from "./(cards)/-resizable-card";
import { ScrollAreaCard } from "./(cards)/-scroll-area-card";
import { SeparatorCard } from "./(cards)/-separator-card";
import { SheetCard } from "./(cards)/-sheet-card";
import { SidebarCard } from "./(cards)/-sidebar-card";
import { SkeletonCard } from "./(cards)/-skeleton-card";
import { SliderCard } from "./(cards)/-slider-card";
import { SonnerCard } from "./(cards)/-sonner-card";
import { SpinnerCard } from "./(cards)/-spinner-card";
import { SwitchCard } from "./(cards)/-switch-card";
import { TabsCard } from "./(cards)/-tabs-card";
import { TextareaCard } from "./(cards)/-textarea-card";
import { TooltipCard } from "./(cards)/-tooltip-card";

interface Props {}

export function ComponentGallery({}: Props) {
  const [search, setSearch] = useState("");

  const filteredComponents = COMPONENTS.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <header className="border-border sticky top-0 z-10 border-b bg-background/95 p-6 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-2xl font-semibold">Component Gallery</h1>
          <p className="text-muted-foreground text-sm">
            @superbuilder/feature-ui/shadcn/ 컴포넌트 미리보기 ({filteredComponents.length}/
            {COMPONENTS.length})
          </p>
          <div className="relative mt-4 max-w-md">
            <SearchIcon className="text-muted-foreground absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              placeholder="Search components..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </header>
      <ScrollArea className="flex-1">
        <main className="mx-auto max-w-7xl p-6">
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {filteredComponents.map((component) => (
              <component.Component key={component.name} />
            ))}
          </div>
          {filteredComponents.length === 0 && (
            <div className="text-muted-foreground py-12 text-center">
              No components found for "{search}"
            </div>
          )}
        </main>
      </ScrollArea>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const COMPONENTS = [
  { name: "Accordion", Component: AccordionCard },
  { name: "Alert Dialog", Component: AlertDialogCard },
  { name: "Avatar", Component: AvatarCard },
  { name: "Badge", Component: BadgeCard },
  { name: "Breadcrumb", Component: BreadcrumbCard },
  { name: "Button", Component: ButtonCard },
  { name: "Button Group", Component: ButtonGroupCard },
  { name: "Card", Component: CardCard },
  { name: "Checkbox", Component: CheckboxCard },
  { name: "Command", Component: CommandCard },
  { name: "Context Menu", Component: ContextMenuCard },
  { name: "Dialog", Component: DialogCard },
  { name: "Drawer", Component: DrawerCard },
  { name: "Dropdown Menu", Component: DropdownMenuCard },
  { name: "Field", Component: FieldCard },
  { name: "Input", Component: InputCard },
  { name: "Input Group", Component: InputGroupCard },
  { name: "Item", Component: ItemCard },
  { name: "Kbd", Component: KbdCard },
  { name: "Label", Component: LabelCard },
  { name: "Menubar", Component: MenubarCard },
  { name: "Popover", Component: PopoverCard },
  { name: "Progress", Component: ProgressCard },
  { name: "Radio Group", Component: RadioGroupCard },
  { name: "Resizable", Component: ResizableCard },
  { name: "Scroll Area", Component: ScrollAreaCard },
  { name: "Separator", Component: SeparatorCard },
  { name: "Sheet", Component: SheetCard },
  { name: "Sidebar", Component: SidebarCard },
  { name: "Skeleton", Component: SkeletonCard },
  { name: "Slider", Component: SliderCard },
  { name: "Sonner", Component: SonnerCard },
  { name: "Spinner", Component: SpinnerCard },
  { name: "Switch", Component: SwitchCard },
  { name: "Tabs", Component: TabsCard },
  { name: "Textarea", Component: TextareaCard },
  { name: "Tooltip", Component: TooltipCard },
] as const;
