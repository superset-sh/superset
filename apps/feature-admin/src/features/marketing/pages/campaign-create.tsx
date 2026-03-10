/**
 * CampaignCreate - 캠페인 생성 폼
 */
import { useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { useCreateCampaign } from "../hooks";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Card, CardContent, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { ArrowLeft } from "lucide-react";

export function CampaignCreate() {
  const navigate = useNavigate();
  const createCampaign = useCreateCampaign();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    createCampaign.mutate(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
        endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
      },
      {
        onSuccess: () => navigate({ to: "/marketing" }),
      },
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/marketing">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            목록으로
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>새 캠페인 생성</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>캠페인명</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="캠페인 이름을 입력하세요"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>설명 (선택)</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="캠페인에 대한 설명"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>시작일 (선택)</Label>
                <Input
                  type="date"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>종료일 (선택)</Label>
                <Input
                  type="date"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Link to="/marketing">
                <Button type="button" variant="outline">
                  취소
                </Button>
              </Link>
              <Button type="submit" disabled={createCampaign.isPending || !name.trim()}>
                {createCampaign.isPending ? "생성 중..." : "생성"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
