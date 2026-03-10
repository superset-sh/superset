import { Shield, CreditCard, Users, FileText, Mail, Bell } from "lucide-react";
import { OnboardingStep } from "./onboarding-step";

export function StepFeatures() {
  return (
    <OnboardingStep
      image={
        <div className="grid grid-cols-3 gap-3 p-6">
          {FEATURE_ITEMS.map((item) => (
            <div
              key={item.label}
              className="flex flex-col items-center gap-1.5 rounded-lg bg-background p-3 shadow-sm"
            >
              <item.icon className="h-5 w-5 text-primary" />
              <span className="text-xs font-medium text-foreground/70">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      }
      title="필요한 기능만 골라 쓰세요"
      description="인증, 결제, 커뮤니티, 게시판, 이메일, 알림 등 검증된 Feature 모듈을 조합하여 빠르게 서비스를 구축할 수 있습니다."
    />
  );
}

/* Constants */

const FEATURE_ITEMS = [
  { icon: Shield, label: "인증" },
  { icon: CreditCard, label: "결제" },
  { icon: Users, label: "커뮤니티" },
  { icon: FileText, label: "게시판" },
  { icon: Mail, label: "이메일" },
  { icon: Bell, label: "알림" },
];
