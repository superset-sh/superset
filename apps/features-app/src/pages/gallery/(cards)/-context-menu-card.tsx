import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@superbuilder/feature-ui/shadcn/card";

interface Props {}

export function ContextMenuCard({}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Context Menu</CardTitle>
        <CardDescription>@superbuilder/feature-ui/shadcn/context-menu</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Demo
          </h4>
          <div className="border-border flex h-32 items-center justify-center rounded-md border border-dashed">
            <p className="text-muted-foreground text-sm">
              Right-click to see context menu
            </p>
          </div>
          <p className="text-muted-foreground mt-2 text-xs">
            Context menus are typically used in desktop applications. They
            appear when right-clicking on elements.
          </p>
        </section>
      </CardContent>
    </Card>
  );
}
