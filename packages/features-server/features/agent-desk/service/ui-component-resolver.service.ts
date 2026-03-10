import { Injectable } from "@nestjs/common";
import { createLogger } from "../../../core/logger";

const logger = createLogger("agent-desk");

export interface ComponentRegistryEntry {
  name: string;
  source: "shadcn" | "custom" | "layout" | "block";
  importPath: string;
  category: string;
  exports: string[];
}

const COMPONENT_REGISTRY: ComponentRegistryEntry[] = [
  // shadcn base components
  { name: "Button", source: "shadcn", importPath: "@superbuilder/feature-ui/shadcn/button", category: "action", exports: ["Button"] },
  { name: "Input", source: "shadcn", importPath: "@superbuilder/feature-ui/shadcn/input", category: "form", exports: ["Input"] },
  { name: "Textarea", source: "shadcn", importPath: "@superbuilder/feature-ui/shadcn/textarea", category: "form", exports: ["Textarea"] },
  { name: "Select", source: "shadcn", importPath: "@superbuilder/feature-ui/shadcn/select", category: "form", exports: ["Select", "SelectContent", "SelectItem", "SelectTrigger", "SelectValue"] },
  { name: "Checkbox", source: "shadcn", importPath: "@superbuilder/feature-ui/shadcn/checkbox", category: "form", exports: ["Checkbox"] },
  { name: "Switch", source: "shadcn", importPath: "@superbuilder/feature-ui/shadcn/switch", category: "form", exports: ["Switch"] },
  { name: "Label", source: "shadcn", importPath: "@superbuilder/feature-ui/shadcn/label", category: "form", exports: ["Label"] },
  { name: "Card", source: "shadcn", importPath: "@superbuilder/feature-ui/shadcn/card", category: "layout", exports: ["Card", "CardContent", "CardDescription", "CardFooter", "CardHeader", "CardTitle"] },
  { name: "Dialog", source: "shadcn", importPath: "@superbuilder/feature-ui/shadcn/dialog", category: "overlay", exports: ["Dialog", "DialogContent", "DialogDescription", "DialogFooter", "DialogHeader", "DialogTitle", "DialogTrigger"] },
  { name: "Table", source: "shadcn", importPath: "@superbuilder/feature-ui/shadcn/table", category: "data", exports: ["Table", "TableBody", "TableCell", "TableHead", "TableHeader", "TableRow"] },
  { name: "Tabs", source: "shadcn", importPath: "@superbuilder/feature-ui/shadcn/tabs", category: "navigation", exports: ["Tabs", "TabsContent", "TabsList", "TabsTrigger"] },
  { name: "Badge", source: "shadcn", importPath: "@superbuilder/feature-ui/shadcn/badge", category: "display", exports: ["Badge"] },
  { name: "Avatar", source: "shadcn", importPath: "@superbuilder/feature-ui/shadcn/avatar", category: "display", exports: ["Avatar", "AvatarFallback", "AvatarImage"] },
  { name: "Separator", source: "shadcn", importPath: "@superbuilder/feature-ui/shadcn/separator", category: "layout", exports: ["Separator"] },
  { name: "ScrollArea", source: "shadcn", importPath: "@superbuilder/feature-ui/shadcn/scroll-area", category: "layout", exports: ["ScrollArea"] },
  { name: "Skeleton", source: "shadcn", importPath: "@superbuilder/feature-ui/shadcn/skeleton", category: "feedback", exports: ["Skeleton"] },
  { name: "Toast", source: "shadcn", importPath: "@superbuilder/feature-ui/shadcn/sonner", category: "feedback", exports: ["Toaster"] },
  { name: "DropdownMenu", source: "shadcn", importPath: "@superbuilder/feature-ui/shadcn/dropdown-menu", category: "overlay", exports: ["DropdownMenu", "DropdownMenuContent", "DropdownMenuItem", "DropdownMenuTrigger"] },
  { name: "Popover", source: "shadcn", importPath: "@superbuilder/feature-ui/shadcn/popover", category: "overlay", exports: ["Popover", "PopoverContent", "PopoverTrigger"] },
  { name: "Tooltip", source: "shadcn", importPath: "@superbuilder/feature-ui/shadcn/tooltip", category: "overlay", exports: ["Tooltip", "TooltipContent", "TooltipProvider", "TooltipTrigger"] },
  { name: "Form", source: "shadcn", importPath: "@superbuilder/feature-ui/shadcn/form", category: "form", exports: ["Form", "FormControl", "FormDescription", "FormField", "FormItem", "FormLabel", "FormMessage"] },
  { name: "Alert", source: "shadcn", importPath: "@superbuilder/feature-ui/shadcn/alert", category: "feedback", exports: ["Alert", "AlertDescription", "AlertTitle"] },

  // Custom app components
  { name: "Feature", source: "custom", importPath: "@superbuilder/feature-ui/components/feature", category: "layout", exports: ["Feature"] },
  { name: "FeatureHeader", source: "custom", importPath: "@superbuilder/feature-ui/components/feature-header", category: "layout", exports: ["FeatureHeader"] },
  { name: "FeatureContents", source: "custom", importPath: "@superbuilder/feature-ui/components/feature-contents", category: "layout", exports: ["FeatureContents"] },

  // Layout components
  { name: "SidebarLayout", source: "layout", importPath: "@superbuilder/feature-ui/layouts/sidebar-layout", category: "layout", exports: ["SidebarLayout"] },

  // Block components
  { name: "SignInBlock", source: "block", importPath: "@superbuilder/feature-ui/blocks/sign-in", category: "auth", exports: ["SignInBlock"] },
];

@Injectable()
export class UiComponentResolverService {
  resolveComponents(
    componentHints?: string[],
    category?: string,
  ): ComponentRegistryEntry[] {
    let results = [...COMPONENT_REGISTRY];

    if (category) {
      results = results.filter((c) => c.category === category);
    }

    if (componentHints && componentHints.length > 0) {
      const hints = componentHints.map((h) => h.toLowerCase());
      results = results.filter((c) =>
        hints.some(
          (hint) =>
            c.name.toLowerCase().includes(hint) ||
            c.category.toLowerCase().includes(hint) ||
            c.exports.some((e) => e.toLowerCase().includes(hint)),
        ),
      );
    }

    logger.debug("UI components resolved", {
      "agent_desk.component_count": results.length,
      "agent_desk.hints": componentHints?.join(", ") ?? "none",
    });

    return results;
  }

  getRegistryMetadata() {
    const categories = [...new Set(COMPONENT_REGISTRY.map((c) => c.category))];
    const sources = [...new Set(COMPONENT_REGISTRY.map((c) => c.source))];

    return {
      totalComponents: COMPONENT_REGISTRY.length,
      categories,
      sources,
    };
  }

  listByCategory(): Record<string, ComponentRegistryEntry[]> {
    const grouped: Record<string, ComponentRegistryEntry[]> = {};
    for (const entry of COMPONENT_REGISTRY) {
      const cat = entry.category;
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat]!.push(entry);
    }
    return grouped;
  }
}
