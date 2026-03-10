import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@superbuilder/feature-ui/shadcn/dialog";
import { useSettingsModal, useSettingsTab } from "../hooks/use-settings-modal";
import { SettingsSidebar } from "./settings-sidebar";
import { GeneralPanel } from "./panels/general-panel";
import { PaymentPanel } from "./panels/payment-panel";
import { AiUsagePanel } from "./panels/ai-usage-panel";

interface Props {}

export function SettingsModal({}: Props) {
  const { open, setOpen } = useSettingsModal();
  const { tab } = useSettingsTab();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[860px] h-[600px] p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">설정</DialogTitle>
        <div className="flex h-full overflow-hidden">
          <SettingsSidebar />
          <div className="flex-1 overflow-y-auto p-6">
            <ActivePanel tab={tab} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------------------------------
 * Components
 * -----------------------------------------------------------------------------------------------*/

interface ActivePanelProps {
  tab: string;
}

function ActivePanel({ tab }: ActivePanelProps) {
  switch (tab) {
    case "general":
      return <GeneralPanel />;
    case "payment":
      return <PaymentPanel />;
    case "ai":
      return <AiUsagePanel />;
    default:
      return <GeneralPanel />;
  }
}
