import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@superbuilder/feature-ui/shadcn/card";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";

interface Props {}

export function BadgeCard({}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Badge</CardTitle>
        <CardDescription>@superbuilder/feature-ui/shadcn/badge</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Variants
          </h4>
          <div className="flex flex-wrap gap-2">
            {BADGE_VARIANTS.map((v) => (
              <Badge key={v} variant={v}>
                {v}
              </Badge>
            ))}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const BADGE_VARIANTS = [
  "default",
  "secondary",
  "destructive",
  "outline",
] as const;
