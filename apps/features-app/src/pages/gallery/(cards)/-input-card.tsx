import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@superbuilder/feature-ui/shadcn/card";
import { Input } from "@superbuilder/feature-ui/shadcn/input";

interface Props {}

export function InputCard({}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Input</CardTitle>
        <CardDescription>@superbuilder/feature-ui/shadcn/input</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Default
          </h4>
          <Input placeholder="Enter text..." />
        </section>
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Types
          </h4>
          <div className="space-y-2">
            <Input type="email" placeholder="Email" />
            <Input type="password" placeholder="Password" />
            <Input type="number" placeholder="Number" />
          </div>
        </section>
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Disabled
          </h4>
          <Input disabled placeholder="Disabled input" />
        </section>
      </CardContent>
    </Card>
  );
}
