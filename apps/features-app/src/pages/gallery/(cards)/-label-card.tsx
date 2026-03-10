import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@superbuilder/feature-ui/shadcn/card";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Checkbox } from "@superbuilder/feature-ui/shadcn/checkbox";

interface Props {}

export function LabelCard({}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Label</CardTitle>
        <CardDescription>@superbuilder/feature-ui/shadcn/label</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            With Input
          </h4>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="Enter email" />
          </div>
        </section>
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            With Checkbox
          </h4>
          <div className="flex items-center gap-2">
            <Checkbox id="terms" />
            <Label htmlFor="terms">Accept terms and conditions</Label>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
