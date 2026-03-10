import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@superbuilder/feature-ui/shadcn/card";
import { Progress } from "@superbuilder/feature-ui/shadcn/progress";

interface Props {}

export function ProgressCard({}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Progress</CardTitle>
        <CardDescription>@superbuilder/feature-ui/shadcn/progress</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Values
          </h4>
          <div className="space-y-4">
            <Progress value={25} />
            <Progress value={50} />
            <Progress value={75} />
            <Progress value={100} />
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
