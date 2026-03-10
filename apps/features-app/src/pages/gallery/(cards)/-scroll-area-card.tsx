import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@superbuilder/feature-ui/shadcn/card";
import { ScrollArea } from "@superbuilder/feature-ui/shadcn/scroll-area";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";

interface Props {}

export function ScrollAreaCard({}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Scroll Area</CardTitle>
        <CardDescription>@superbuilder/feature-ui/shadcn/scroll-area</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Vertical Scroll
          </h4>
          <ScrollArea className="h-48 w-full rounded-md border p-4">
            {ITEMS.map((item, index) => (
              <div key={index}>
                <div className="text-sm">{item}</div>
                {index < ITEMS.length - 1 && <Separator className="my-2" />}
              </div>
            ))}
          </ScrollArea>
        </section>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const ITEMS = [
  "Item 1",
  "Item 2",
  "Item 3",
  "Item 4",
  "Item 5",
  "Item 6",
  "Item 7",
  "Item 8",
  "Item 9",
  "Item 10",
];
