import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@superbuilder/feature-ui/shadcn/card";

interface Props {}

export function SidebarCard({}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sidebar</CardTitle>
        <CardDescription>@superbuilder/feature-ui/shadcn/sidebar</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Description
          </h4>
          <div className="border-border flex h-32 items-center justify-center rounded-md border border-dashed">
            <p className="text-muted-foreground text-sm">Sidebar component</p>
          </div>
          <p className="text-muted-foreground mt-2 text-xs">
            A composable, themeable and customizable sidebar component. Used in
            the admin layout of this application.
          </p>
        </section>
      </CardContent>
    </Card>
  );
}
