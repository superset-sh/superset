import { Bot, Wand2, ImageIcon, MessageSquare, BarChart3, FileText } from "lucide-react";
import { OnboardingStep } from "./onboarding-step";

export function StepAi() {
  return (
    <OnboardingStep
      image={
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-center justify-center gap-4">
            {AI_TOP_ITEMS.map((item) => (
              <div
                key={item.label}
                className="flex flex-col items-center gap-2 rounded-xl bg-background p-4 shadow-sm flex-1"
              >
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <item.icon className="h-6 w-6 text-primary" />
                </div>
                <span className="text-xs font-bold text-foreground">
                  {item.label}
                </span>
                <span className="text-[10px] text-muted-foreground text-center leading-tight">
                  {item.desc}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-3">
            {AI_BOTTOM_ITEMS.map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-1.5 rounded-full bg-background px-3 py-1.5 shadow-sm"
              >
                <item.icon className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] font-medium text-foreground/70">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      }
      title="AI가 함께합니다"
      description="AI Agent가 데이터를 분석하고 질문에 답하며, Content Studio가 콘텐츠를 자동 생성합니다. 이미지 생성, 마케팅 카피까지 AI로 해결하세요."
    />
  );
}

/* Constants */

const AI_TOP_ITEMS = [
  { icon: Bot, label: "AI Agent", desc: "대화형 데이터 분석" },
  { icon: Wand2, label: "Content Studio", desc: "콘텐츠 자동 생성" },
  { icon: ImageIcon, label: "AI Image", desc: "이미지 생성/편집" },
];

const AI_BOTTOM_ITEMS = [
  { icon: MessageSquare, label: "자연어 질의" },
  { icon: BarChart3, label: "데이터 분석" },
  { icon: FileText, label: "마케팅 카피" },
];
