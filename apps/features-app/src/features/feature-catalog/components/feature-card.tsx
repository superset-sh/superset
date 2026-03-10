import { AccordionContent, AccordionItem, AccordionTrigger } from "@superbuilder/feature-ui/shadcn/accordion";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import type { FeatureCatalogItem } from "../data/feature-catalog";

interface Props {
  feature: FeatureCatalogItem;
}

const STATUS_VARIANT: Record<string, "success" | "warning" | "secondary"> = {
  active: "success",
  wip: "warning",
  planned: "secondary",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  wip: "WIP",
  planned: "Planned",
};

const TYPE_LABEL: Record<string, string> = {
  page: "Page",
  widget: "Widget",
  agent: "Agent",
};

export function FeatureCard({ feature }: Props) {
  const Icon = feature.icon;

  return (
    <AccordionItem value={feature.id} className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline py-3">
        <div className="flex items-center gap-3 text-left">
          <div className="rounded-md bg-muted p-2 shrink-0">
            <Icon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium">{feature.name}</span>
              <Badge variant={STATUS_VARIANT[feature.status]} className="text-[10px] px-1.5 py-0">
                {STATUS_LABEL[feature.status]}
              </Badge>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {TYPE_LABEL[feature.type]}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground truncate">{feature.description}</p>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        <div className="grid gap-4 pl-11">
          {feature.pages.length > 0 ? (
            <DetailSection title="Pages">
              <div className="flex flex-wrap gap-2">
                {feature.pages.map((page) => (
                  <Link
                    key={page.path}
                    to={page.path}
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {page.label}
                    <span className="text-xs text-muted-foreground">({page.path})</span>
                  </Link>
                ))}
              </div>
            </DetailSection>
          ) : null}

          {feature.services.length > 0 ? (
            <DetailSection title="Services">
              <ul className="grid gap-1 sm:grid-cols-2">
                {feature.services.map((service) => (
                  <li key={service} className="text-sm text-muted-foreground">
                    • {service}
                  </li>
                ))}
              </ul>
            </DetailSection>
          ) : null}

          {feature.tables.length > 0 ? (
            <DetailSection title="Tables">
              <div className="flex flex-wrap gap-1.5">
                {feature.tables.map((table) => (
                  <Badge key={table} variant="outline" className="font-mono text-xs">
                    {table}
                  </Badge>
                ))}
              </div>
            </DetailSection>
          ) : null}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

/* Components */

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
        {title}
      </h4>
      {children}
    </div>
  );
}
