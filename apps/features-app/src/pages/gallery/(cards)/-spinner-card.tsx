import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@superbuilder/feature-ui/shadcn/card";
import { Spinner } from "@superbuilder/feature-ui/shadcn/spinner";

interface Props {}

export function SpinnerCard({}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Spinner</CardTitle>
        <CardDescription>@superbuilder/feature-ui/shadcn/spinner</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Sizes
          </h4>
          <div className="flex items-center gap-4">
            <Spinner className="size-4" />
            <Spinner className="size-6" />
            <Spinner className="size-8" />
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
