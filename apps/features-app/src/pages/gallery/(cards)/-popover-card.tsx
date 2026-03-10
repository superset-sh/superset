import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@superbuilder/feature-ui/shadcn/card";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
} from "@superbuilder/feature-ui/shadcn/popover";
import { Button } from "@superbuilder/feature-ui/shadcn/button";

interface Props {}

export function PopoverCard({}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Popover</CardTitle>
        <CardDescription>@superbuilder/feature-ui/shadcn/popover</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Default
          </h4>
          <Popover>
            <PopoverTrigger render={<Button variant="outline" />}>
              Open Popover
            </PopoverTrigger>
            <PopoverContent>
              <PopoverHeader>
                <PopoverTitle>Popover Title</PopoverTitle>
                <PopoverDescription>
                  This is a popover description.
                </PopoverDescription>
              </PopoverHeader>
              <p className="text-sm">Popover content goes here.</p>
            </PopoverContent>
          </Popover>
        </section>
      </CardContent>
    </Card>
  );
}
