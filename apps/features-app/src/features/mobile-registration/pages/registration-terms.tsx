import { useNavigate } from "@tanstack/react-router";
import {
  Scaffold,
  ScaffoldHeader,
  ScaffoldContent,
  ScaffoldFooter,
} from "@superbuilder/feature-ui/mobile/scaffold";
import { ScaffoldCTAButton } from "@superbuilder/feature-ui/mobile/scaffold-cta-button";
import { Checkbox } from "@superbuilder/feature-ui/shadcn/checkbox";
import { useRegistrationStore } from "../hooks/use-registration-store";

export function RegistrationTerms() {
  const navigate = useNavigate();
  const { data, updateField } = useRegistrationStore();

  const isValid = data.agreedTerms && data.agreedPrivacy;

  const handleNext = () => {
    navigate({ to: "/register/confirm" });
  };

  const handleBack = () => {
    navigate({ to: "/register" });
  };

  const handleAgreeAll = () => {
    const allAgreed = data.agreedTerms && data.agreedPrivacy;
    updateField("agreedTerms", !allAgreed);
    updateField("agreedPrivacy", !allAgreed);
  };

  return (
    <Scaffold variant="secondary">
      <ScaffoldHeader title="신청하기" onBack={handleBack} />
      <ScaffoldContent>
        <div className="flex flex-col gap-8 px-5 py-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold">약관 동의</h2>
            <p className="text-sm text-muted-foreground">
              서비스 이용을 위해 약관에 동의해 주세요.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-muted/50 p-4">
              <Checkbox
                checked={data.agreedTerms && data.agreedPrivacy}
                onCheckedChange={handleAgreeAll}
              />
              <span className="text-base font-medium">전체 동의</span>
            </label>

            <div className="flex flex-col gap-3 pl-2">
              <label className="flex cursor-pointer items-center gap-3 py-2">
                <Checkbox
                  checked={data.agreedTerms}
                  onCheckedChange={(checked) =>
                    updateField("agreedTerms", checked === true)
                  }
                />
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">[필수] 이용약관 동의</span>
                  <span className="text-sm text-muted-foreground">
                    서비스 이용약관에 동의합니다.
                  </span>
                </div>
              </label>

              <label className="flex cursor-pointer items-center gap-3 py-2">
                <Checkbox
                  checked={data.agreedPrivacy}
                  onCheckedChange={(checked) =>
                    updateField("agreedPrivacy", checked === true)
                  }
                />
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">
                    [필수] 개인정보 수집 및 이용 동의
                  </span>
                  <span className="text-sm text-muted-foreground">
                    개인정보 처리방침에 동의합니다.
                  </span>
                </div>
              </label>
            </div>
          </div>
        </div>
      </ScaffoldContent>
      <ScaffoldFooter>
        <ScaffoldCTAButton disabled={!isValid} onClick={handleNext}>
          다음
        </ScaffoldCTAButton>
      </ScaffoldFooter>
    </Scaffold>
  );
}
