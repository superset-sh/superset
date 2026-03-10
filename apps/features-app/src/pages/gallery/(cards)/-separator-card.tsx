import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@superbuilder/feature-ui/shadcn/card";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";

interface Props {}

export function SeparatorCard({}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Separator</CardTitle>
        <CardDescription>@superbuilder/feature-ui/shadcn/separator</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Horizontal
          </h4>
          <div className="space-y-2">
            <p className="text-sm">Content above</p>
            <Separator />
            <p className="text-sm">Content below</p>
          </div>
        </section>
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Vertical
          </h4>
          <div className="flex h-8 items-center gap-4">
            <span className="text-sm">Left</span>
            <Separator orientation="vertical" />
            <span className="text-sm">Right</span>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
