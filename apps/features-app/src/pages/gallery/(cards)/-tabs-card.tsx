import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@superbuilder/feature-ui/shadcn/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@superbuilder/feature-ui/shadcn/tabs";

interface Props {}

export function TabsCard({}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tabs</CardTitle>
        <CardDescription>@superbuilder/feature-ui/shadcn/tabs</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Default
          </h4>
          <Tabs defaultValue="tab1">
            <TabsList>
              <TabsTrigger value="tab1">Account</TabsTrigger>
              <TabsTrigger value="tab2">Password</TabsTrigger>
              <TabsTrigger value="tab3">Settings</TabsTrigger>
            </TabsList>
            <TabsContent value="tab1">
              <p className="text-muted-foreground text-sm">
                Account settings and preferences.
              </p>
            </TabsContent>
            <TabsContent value="tab2">
              <p className="text-muted-foreground text-sm">
                Change your password here.
              </p>
            </TabsContent>
            <TabsContent value="tab3">
              <p className="text-muted-foreground text-sm">
                Manage your settings.
              </p>
            </TabsContent>
          </Tabs>
        </section>
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Line Variant
          </h4>
          <Tabs defaultValue="tab1">
            <TabsList variant="line">
              <TabsTrigger value="tab1">Overview</TabsTrigger>
              <TabsTrigger value="tab2">Analytics</TabsTrigger>
              <TabsTrigger value="tab3">Reports</TabsTrigger>
            </TabsList>
            <TabsContent value="tab1">
              <p className="text-muted-foreground text-sm">Overview content.</p>
            </TabsContent>
            <TabsContent value="tab2">
              <p className="text-muted-foreground text-sm">Analytics content.</p>
            </TabsContent>
            <TabsContent value="tab3">
              <p className="text-muted-foreground text-sm">Reports content.</p>
            </TabsContent>
          </Tabs>
        </section>
      </CardContent>
    </Card>
  );
}
