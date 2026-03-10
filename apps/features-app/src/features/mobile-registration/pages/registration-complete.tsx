import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CircleCheck } from "lucide-react";
import {
  Scaffold,
  ScaffoldContent,
  ScaffoldFooter,
} from "@superbuilder/feature-ui/mobile/scaffold";
import { ScaffoldCTAButton } from "@superbuilder/feature-ui/mobile/scaffold-cta-button";
import { useRegistrationStore } from "../hooks/use-registration-store";

export function RegistrationComplete() {
  const navigate = useNavigate();
  const { data, reset } = useRegistrationStore();

  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  const handleGoHome = () => {
    navigate({ to: "/" });
  };

  return (
    <Scaffold variant="secondary">
      <ScaffoldContent>
        <div className="flex flex-1 flex-col items-center justify-center gap-8 px-5 py-6">
          <div className="flex flex-col items-center gap-4">
            <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
              <CircleCheck className="size-8 text-primary" />
            </div>

            <div className="flex flex-col items-center gap-2 text-center">
              <h2 className="text-2xl font-semibold">신청이 완료되었습니다</h2>
              <p className="text-sm text-muted-foreground">
                {data.name}님, 신청해 주셔서 감사합니다.
                <br />
                입력하신 이메일({data.email})로 안내를 보내드리겠습니다.
              </p>
            </div>
          </div>
        </div>
      </ScaffoldContent>
      <ScaffoldFooter>
        <ScaffoldCTAButton onClick={handleGoHome}>홈으로</ScaffoldCTAButton>
      </ScaffoldFooter>
    </Scaffold>
  );
}
