import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@superbuilder/feature-ui/shadcn/collapsible";
import { Accordion } from "@superbuilder/feature-ui/shadcn/accordion";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { ChevronDown } from "lucide-react";
import { FeatureCard } from "./feature-card";
import type { FeatureCatalogItem, FeatureGroupInfo } from "../data/feature-catalog";

interface Props {
  group: FeatureGroupInfo;
  features: FeatureCatalogItem[];
  defaultOpen?: boolean;
}

export function FeatureGroupSection({ group, features, defaultOpen = true }: Props) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 py-2 text-left hover:opacity-80">
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform [[data-state=closed]_&]:-rotate-90" />
        <h3 className="text-lg font-semibold">{group.label}</h3>
        <Badge variant="secondary" className="text-xs">{features.length}</Badge>
        <span className="text-sm text-muted-foreground">— {group.description}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Accordion multiple className="grid gap-2 pt-2">
          {features.map((feature) => (
            <FeatureCard key={feature.id} feature={feature} />
          ))}
        </Accordion>
      </CollapsibleContent>
    </Collapsible>
  );
}
