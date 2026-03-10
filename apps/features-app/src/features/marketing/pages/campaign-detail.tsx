/**
 * CampaignDetail - 캠페인 상세 + 콘텐츠 목록
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { useCampaignById, useMarketingContents, useDeleteCampaign, useUpdateCampaign } from "../hooks";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@superbuilder/feature-ui/shadcn/table";
import { ArrowLeft, Plus, Edit, Trash2, Calendar } from "lucide-react";

interface Props {
  campaignId: string;
}

export function CampaignDetail({ campaignId }: Props) {
  const { data: campaign, isLoading: campaignLoading } = useCampaignById(campaignId);
  const { data: contentsData, isLoading: contentsLoading } = useMarketingContents({
    campaignId,
  });
  const deleteCampaign = useDeleteCampaign();
  const updateCampaign = useUpdateCampaign();
  const navigate = useNavigate();

  const handleDelete = () => {
    if (!confirm("이 캠페인을 삭제하시겠습니까?")) return;
    deleteCampaign.mutate(campaignId, {
      onSuccess: () => navigate({ to: "/marketing" }),
    });
  };

  const handleStatusChange = (status: string) => {
    updateCampaign.mutate({
      id: campaignId,
      data: { status: status as "draft" | "active" | "paused" | "completed" | "archived" },
    });
  };

  if (campaignLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        캠페인을 찾을 수 없습니다.
      </div>
    );
  }

  const contents = contentsData?.data ?? [];

  return (
    <div className="space-y-6">
      {/* 상단 네비게이션 */}
      <div className="flex items-center gap-4">
        <Link to="/marketing">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            목록으로
          </Button>
        </Link>
      </div>

      {/* 캠페인 정보 */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <CardTitle className="text-xl" data-testid="campaign-title">{campaign.name}</CardTitle>
              <Badge variant={campaign.status === "active" ? "default" : "secondary"} data-testid="campaign-status-badge">
                {STATUS_LABEL[campaign.status] ?? campaign.status}
              </Badge>
            </div>
            {campaign.description && (
              <p className="text-sm text-muted-foreground">{campaign.description}</p>
            )}
            {campaign.startsAt && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                <Calendar className="h-3 w-3" />
                {new Date(campaign.startsAt).toLocaleDateString("ko-KR")}
                {campaign.endsAt && (
                  <> ~ {new Date(campaign.endsAt).toLocaleDateString("ko-KR")}</>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <StatusButtons
              currentStatus={campaign.status}
              onChange={handleStatusChange}
              isPending={updateCampaign.isPending}
            />
            <Button variant="ghost" size="sm" className="text-destructive" onClick={handleDelete} data-testid="campaign-delete-btn">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* 콘텐츠 목록 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">콘텐츠</CardTitle>
          <Link to="/marketing/contents/new">
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" />
              새 콘텐츠
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {contentsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : contents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              이 캠페인에 등록된 콘텐츠가 없습니다.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>제목</TableHead>
                  <TableHead>생성일</TableHead>
                  <TableHead className="text-right">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contents.map((content) => (
                  <TableRow key={content.id}>
                    <TableCell className="font-medium">{content.title}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(content.createdAt).toLocaleDateString("ko-KR")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link to="/marketing/contents/$id/edit" params={{ id: content.id }}>
                        <Button variant="ghost" size="sm">
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface StatusButtonsProps {
  currentStatus: string;
  onChange: (status: string) => void;
  isPending: boolean;
}

function StatusButtons({ currentStatus, onChange, isPending }: StatusButtonsProps) {
  const nextStatuses = NEXT_STATUS[currentStatus] ?? [];
  return (
    <>
      {nextStatuses.map((status) => (
        <Button
          key={status}
          variant="outline"
          size="sm"
          onClick={() => onChange(status)}
          disabled={isPending}
          data-testid={`campaign-status-${status}`}
        >
          {STATUS_LABEL[status] ?? status}
        </Button>
      ))}
    </>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const STATUS_LABEL: Record<string, string> = {
  draft: "초안",
  active: "진행 중",
  paused: "일시정지",
  completed: "완료",
  archived: "보관",
};

const NEXT_STATUS: Record<string, string[]> = {
  draft: ["active"],
  active: ["paused", "completed"],
  paused: ["active", "completed"],
  completed: ["archived"],
  archived: [],
};
