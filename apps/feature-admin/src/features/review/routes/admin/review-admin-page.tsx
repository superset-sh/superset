import { Tabs, TabsContent, TabsList, TabsTrigger } from "@superbuilder/feature-ui/shadcn/tabs";
import { ReviewManager } from "../../pages/review-manager";
import { ReportQueue } from "../../pages/report-queue";

export function ReviewAdminPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Review Management</h1>
        <p className="text-muted-foreground">
          Moderate reviews and handle abuse reports
        </p>
      </div>

      <Tabs defaultValue="reviews" className="space-y-4">
        <TabsList>
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="reviews" className="space-y-4">
          <ReviewManager />
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <ReportQueue />
        </TabsContent>
      </Tabs>
    </div>
  );
}
