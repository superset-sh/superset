import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@superbuilder/feature-ui/shadcn/card";

interface Props {}

export function ResizableCard({}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Resizable</CardTitle>
        <CardDescription>@superbuilder/feature-ui/shadcn/resizable</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Description
          </h4>
          <div className="border-border flex h-32 items-center justify-center rounded-md border border-dashed">
            <p className="text-muted-foreground text-sm">Resizable Panels</p>
          </div>
          <p className="text-muted-foreground mt-2 text-xs">
            A group of resizable panel components that can be used to build
            resizable layouts. Drag the handle between panels to resize.
          </p>
        </section>
      </CardContent>
    </Card>
  );
}
