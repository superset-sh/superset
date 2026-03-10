import { useState, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@superbuilder/feature-ui/shadcn/sheet";
import { Button } from "@superbuilder/feature-ui/shadcn/button";
import { Bot } from "lucide-react";
import { ChatStream } from "../chat/chat-stream";
import { ChatInput } from "../chat/chat-input";
import { useChatStream } from "../../hooks/use-chat-stream";

interface Props {
  /** 트리거 버튼 커스터마이즈. 미제공 시 기본 FAB 버튼 */
  trigger?: React.ReactElement;
  /** 에이전트 ID (선택) */
  agentId?: string;
}

export function AgentSlideover({ trigger, agentId }: Props) {
  const [open, setOpen] = useState(false);
  const { messages, isStreaming, sendMessage, stopStreaming } = useChatStream();

  const handleSend = useCallback(
    (message: string) => {
      sendMessage({ message, agentId });
    },
    [sendMessage, agentId],
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          trigger ?? (
            <Button
              size="icon-lg"
              className="fixed bottom-6 right-6 z-50 rounded-full shadow-md"
            >
              <Bot className="h-5 w-5" />
            </Button>
          )
        }
      />
      <SheetContent side="right" className="flex w-[420px] flex-col p-0 sm:max-w-[420px]">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="text-base">AI 어시스턴트</SheetTitle>
        </SheetHeader>
        <div className="flex flex-1 flex-col overflow-hidden">
          <ChatStream messages={messages} isStreaming={isStreaming} />
          <ChatInput
            onSend={handleSend}
            onStop={stopStreaming}
            isStreaming={isStreaming}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
