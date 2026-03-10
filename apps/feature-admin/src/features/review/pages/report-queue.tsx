import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@superbuilder/feature-ui/shadcn/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superbuilder/feature-ui/shadcn/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@superbuilder/feature-ui/shadcn/dialog";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { useAdminReports, useAdminResolveReport } from "../hooks";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import type { ReportStatus } from "../types";

export function ReportQueue() {
  const [statusFilter, setStatusFilter] = useState<ReportStatus | "all">("pending");
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [adminNotes, setAdminNotes] = useState("");

  const { data: reports, isLoading } = useAdminReports(
    statusFilter === "all" ? undefined : statusFilter
  );
  const resolveReport = useAdminResolveReport();

  const handleResolve = async (action: "resolved" | "dismissed") => {
    if (!selectedReport) return;

    try {
      await resolveReport.mutateAsync({
        reportId: selectedReport.id,
        action,
        notes: adminNotes || undefined,
      });
      toast.success(`Report ${action} successfully`);
      setSelectedReport(null);
      setAdminNotes("");
    } catch (error: any) {
      toast.error(error.message || "Failed to resolve report");
    }
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Report Queue</CardTitle>
            <Select
              value={statusFilter}
              onValueChange={(value) => value && setStatusFilter(value as ReportStatus | "all")}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Reports</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {!reports || reports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No reports found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reason</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reported</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report: any) => (
                  <TableRow key={report.id}>
                    <TableCell className="font-medium capitalize">
                      {report.reason}
                    </TableCell>
                    <TableCell className="max-w-md truncate text-muted-foreground">
                      {report.details || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          report.status === "resolved"
                            ? "default"
                            : report.status === "dismissed"
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {report.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-right">
                      {report.status === "pending" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedReport(report)}
                        >
                          Review
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Resolve Dialog */}
      <Dialog open={!!selectedReport} onOpenChange={() => setSelectedReport(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Report</DialogTitle>
            <DialogDescription>
              Decide how to handle this report
            </DialogDescription>
          </DialogHeader>

          {selectedReport && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">Reason:</p>
                <p className="text-sm text-muted-foreground capitalize">
                  {selectedReport.reason}
                </p>
              </div>

              {selectedReport.details && (
                <div>
                  <p className="text-sm font-medium">Details:</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedReport.details}
                  </p>
                </div>
              )}

              <div>
                <p className="text-sm font-medium mb-2">Admin Notes (optional):</p>
                <Textarea
                  placeholder="Add notes about your decision..."
                  value={adminNotes}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setAdminNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => handleResolve("dismissed")}
              disabled={resolveReport.isPending}
            >
              Dismiss
            </Button>
            <Button
              onClick={() => handleResolve("resolved")}
              disabled={resolveReport.isPending}
            >
              {resolveReport.isPending ? "Resolving..." : "Resolve & Hide Review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
