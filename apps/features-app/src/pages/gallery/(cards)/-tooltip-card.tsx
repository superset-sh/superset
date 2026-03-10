import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@superbuilder/feature-ui/shadcn/card";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@superbuilder/feature-ui/shadcn/tooltip";
import { Button } from "@superbuilder/feature-ui/shadcn/button";

interface Props {}

export function TooltipCard({}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tooltip</CardTitle>
        <CardDescription>@superbuilder/feature-ui/shadcn/tooltip</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Positions
          </h4>
          <div className="flex flex-wrap gap-2">
            <Tooltip>
              <TooltipTrigger render={<Button variant="outline" />}>
                Top
              </TooltipTrigger>
              <TooltipContent side="top">Tooltip on top</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger render={<Button variant="outline" />}>
                Bottom
              </TooltipTrigger>
              <TooltipContent side="bottom">Tooltip on bottom</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger render={<Button variant="outline" />}>
                Left
              </TooltipTrigger>
              <TooltipContent side="left">Tooltip on left</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger render={<Button variant="outline" />}>
                Right
              </TooltipTrigger>
              <TooltipContent side="right">Tooltip on right</TooltipContent>
            </Tooltip>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
