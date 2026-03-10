import { useState } from "react";
import { useTRPC } from "@superbuilder/features-client/trpc-client";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@superbuilder/feature-ui/shadcn/card";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Label } from "@superbuilder/feature-ui/shadcn/label";
import { Textarea } from "@superbuilder/feature-ui/shadcn/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

/**
 * 공지 발송 폼 (Admin)
 */
export function NotificationBroadcastForm() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const broadcast = useMutation({
    ...trpc.notification.admin.broadcast.mutationOptions(),
    onSuccess: (data: { success: boolean; count: number }) => {
      toast.success(`${data.count}명에게 공지를 발송했습니다`);
      setTitle("");
      setContent("");
      queryClient.invalidateQueries({
        queryKey: trpc.notification.admin.getStats.queryKey(),
      });
    },
    onError: () => {
      toast.error("공지 발송에 실패했습니다");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      toast.error("제목과 내용을 입력해주세요");
      return;
    }
    broadcast.mutate({ title: title.trim(), content: content.trim() } as any);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>공지 발송</CardTitle>
        <CardDescription>전체 사용자에게 공지 알림을 발송합니다</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">제목</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="공지 제목을 입력하세요"
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="content">내용</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="공지 내용을 입력하세요"
              rows={4}
            />
          </div>
          <Button type="submit" disabled={broadcast.isPending}>
            {broadcast.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            발송
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
