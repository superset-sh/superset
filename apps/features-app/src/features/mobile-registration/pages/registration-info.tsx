import { useNavigate } from "@tanstack/react-router";
import {
  Scaffold,
  ScaffoldHeader,
  ScaffoldContent,
  ScaffoldFooter,
} from "@superbuilder/feature-ui/mobile/scaffold";
import { ScaffoldCTAButton } from "@superbuilder/feature-ui/mobile/scaffold-cta-button";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { useRegistrationStore } from "../hooks/use-registration-store";

export function RegistrationInfo() {
  const navigate = useNavigate();
  const { data, updateField } = useRegistrationStore();

  const isValid = data.name.trim().length > 0 && isValidEmail(data.email) && data.phone.length >= 10;

  const handleNext = () => {
    navigate({ to: "/register/terms" });
  };

  const handleBack = () => {
    navigate({ to: "/" });
  };

  return (
    <Scaffold variant="secondary">
      <ScaffoldHeader title="신청하기" onBack={handleBack} />
      <ScaffoldContent>
        <div className="flex flex-col gap-8 px-5 py-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold">기본 정보</h2>
            <p className="text-sm text-muted-foreground">
              신청에 필요한 기본 정보를 입력해 주세요.
            </p>
          </div>

          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <label htmlFor="name" className="text-sm font-medium">
                이름
              </label>
              <Input
                id="name"
                placeholder="홍길동"
                value={data.name}
                onChange={(e) => updateField("name", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="email" className="text-sm font-medium">
                이메일
              </label>
              <Input
                id="email"
                type="email"
                placeholder="example@email.com"
                value={data.email}
                onChange={(e) => updateField("email", e.target.value)}
              />
              {data.email.length > 0 && !isValidEmail(data.email) && (
                <p className="text-sm text-destructive">올바른 이메일 형식이 아닙니다.</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="phone" className="text-sm font-medium">
                전화번호
              </label>
              <Input
                id="phone"
                type="tel"
                placeholder="010-1234-5678"
                value={data.phone}
                onChange={(e) => updateField("phone", e.target.value)}
              />
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

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

