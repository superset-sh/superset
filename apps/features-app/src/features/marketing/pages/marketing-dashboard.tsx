/**
 * MarketingDashboard - 캠페인 목록 + 통계 대시보드
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useCampaigns, useCreateCampaign } from "../hooks";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Badge } from "@superbuilder/feature-ui/shadcn/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { Skeleton } from "@superbuilder/feature-ui/shadcn/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@superbuilder/feature-ui/shadcn/dialog";
import { Plus, Calendar, FileText, Send } from "lucide-react";

export function MarketingDashboard() {
  const { data, isLoading, error } = useCampaigns();
  const createCampaign = useCreateCampaign();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const handleCreate = () => {
    if (!newName.trim()) return;
    createCampaign.mutate(
      {
        name: newName,
        description: newDescription || undefined,
      },
      {
        onSuccess: () => {
          setIsCreateOpen(false);
          setNewName("");
          setNewDescription("");
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full mt-2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-1/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        캠페인 목록을 불러오는 중 오류가 발생했습니다.
      </div>
    );
  }

  const campaigns = data?.data ?? [];

  return (
    <div className="space-y-6">
      {/* 생성 다이얼로그 */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>새 캠페인 생성</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-sm">캠페인명</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="캠페인 이름"
                className="mt-1.5"
                data-testid="campaign-name-input"
              />
            </div>
            <div>
              <Label className="text-sm">설명 (선택)</Label>
              <Input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="캠페인에 대한 간단한 설명"
                className="mt-1.5"
                data-testid="campaign-desc-input"
              />
            </div>
            <Button
              onClick={handleCreate}
              disabled={createCampaign.isPending || !newName.trim()}
              className="w-full"
              data-testid="campaign-create-submit"
            >
              {createCampaign.isPending ? "생성 중..." : "생성"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 캠페인 목록 */}
      {campaigns.length === 0 ? (
        <div className="text-center py-12" data-testid="campaign-empty-state">
          <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <FileText className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <h3 className="text-lg font-semibold mb-1">캠페인이 없습니다</h3>
          <p className="text-sm text-muted-foreground mb-4">
            첫 번째 마케팅 캠페인을 만들어 보세요
          </p>
          <Button onClick={() => setIsCreateOpen(true)} data-testid="campaign-create-first-btn">
            <Plus className="mr-1.5 h-4 w-4" />
            첫 캠페인 만들기
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="campaign-list">
          {campaigns.map((campaign) => (
            <Link
              key={campaign.id}
              to="/marketing/campaigns/$id"
              params={{ id: campaign.id }}
              data-testid="campaign-card"
            >
              <Card className="transition-colors hover:border-primary/50 cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg line-clamp-1" data-testid="campaign-card-name">{campaign.name}</CardTitle>
                    <CampaignStatusBadge status={campaign.status} />
                  </div>
                  {campaign.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {campaign.description}
                    </p>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5" />
                      {(campaign as CampaignRow).contentCount ?? 0} 콘텐츠
                    </span>
                    <span className="flex items-center gap-1">
                      <Send className="h-3.5 w-3.5" />
                      {(campaign as CampaignRow).publishedCount ?? 0} 발행
                    </span>
                  </div>
                  {campaign.startsAt && (
                    <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {new Date(campaign.startsAt).toLocaleDateString("ko-KR")}
                      {campaign.endsAt && (
                        <> ~ {new Date(campaign.endsAt).toLocaleDateString("ko-KR")}</>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface CampaignStatusBadgeProps {
  status: string;
}

function CampaignStatusBadge({ status }: CampaignStatusBadgeProps) {
  const variant = STATUS_VARIANT[status] ?? ("secondary" as const);
  const label = STATUS_LABEL[status] ?? status;
  return <Badge variant={variant}>{label}</Badge>;
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  active: "default",
  paused: "outline",
  completed: "secondary",
  archived: "outline",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "초안",
  active: "진행 중",
  paused: "일시정지",
  completed: "완료",
  archived: "보관",
};

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface CampaignRow {
  contentCount?: number;
  publishedCount?: number;
}
