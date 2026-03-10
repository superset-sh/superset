import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@superbuilder/feature-ui/shadcn/card";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@superbuilder/feature-ui/shadcn/accordion";

interface Props {}

export function AccordionCard({}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Accordion</CardTitle>
        <CardDescription>@superbuilder/feature-ui/shadcn/accordion</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Default
          </h4>
          <Accordion>
            <AccordionItem value="item-1">
              <AccordionTrigger>What is this?</AccordionTrigger>
              <AccordionContent>
                This is an accordion component for organizing content.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger>How does it work?</AccordionTrigger>
              <AccordionContent>
                Click on the trigger to expand or collapse the content.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger>Is it accessible?</AccordionTrigger>
              <AccordionContent>
                Yes, it follows WAI-ARIA design patterns.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>
      </CardContent>
    </Card>
  );
}
