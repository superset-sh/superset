import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@superbuilder/feature-ui/shadcn/card";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";

interface Props {}

export function TextareaCard({}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Textarea</CardTitle>
        <CardDescription>@superbuilder/feature-ui/shadcn/textarea</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Default
          </h4>
          <Textarea placeholder="Enter your message..." />
        </section>
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Disabled
          </h4>
          <Textarea disabled placeholder="Disabled textarea" />
        </section>
      </CardContent>
    </Card>
  );
}
