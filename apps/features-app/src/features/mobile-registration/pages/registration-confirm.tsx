import { useNavigate } from "@tanstack/react-router";
import {
  Scaffold,
  ScaffoldHeader,
  ScaffoldContent,
  ScaffoldFooter,
} from "@superbuilder/feature-ui/mobile/scaffold";
import { ScaffoldCTAButton } from "@superbuilder/feature-ui/mobile/scaffold-cta-button";
import { Separator } from "@superbuilder/feature-ui/shadcn/separator";
import { useRegistrationStore } from "../hooks/use-registration-store";

export function RegistrationConfirm() {
  const navigate = useNavigate();
  const { data } = useRegistrationStore();

  const handleSubmit = () => {
    navigate({ to: "/register/complete" });
  };

  const handleBack = () => {
    navigate({ to: "/register/terms" });
  };

  return (
    <Scaffold variant="secondary">
      <ScaffoldHeader title="신청하기" onBack={handleBack} />
      <ScaffoldContent>
        <div className="flex flex-col gap-8 px-5 py-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold">신청 정보 확인</h2>
            <p className="text-sm text-muted-foreground">
              입력하신 정보를 확인해 주세요.
            </p>
          </div>

          <div className="flex flex-col gap-4 rounded-lg bg-muted/30 p-6">
            <SummaryRow label="이름" value={data.name} />
            <Separator />
            <SummaryRow label="이메일" value={data.email} />
            <Separator />
            <SummaryRow label="전화번호" value={data.phone} />
            <Separator />
            <SummaryRow
              label="이용약관"
              value={data.agreedTerms ? "동의" : "미동의"}
            />
            <SummaryRow
              label="개인정보"
              value={data.agreedPrivacy ? "동의" : "미동의"}
            />
          </div>
        </div>
      </ScaffoldContent>
      <ScaffoldFooter>
        <ScaffoldCTAButton onClick={handleSubmit}>신청 완료</ScaffoldCTAButton>
      </ScaffoldFooter>
    </Scaffold>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface SummaryRowProps {
  label: string;
  value: string;
}

function SummaryRow({ label, value }: SummaryRowProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
