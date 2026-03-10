import { Button } from "@superbuilder/feature-ui/shadcn/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@superbuilder/feature-ui/shadcn/sheet";
import { useEffect, useState } from "react";
import { Signature } from "./signature";

interface SignatureBottomSheetProps {
  title: string;
  open: boolean;
  confirmText?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (signature: string) => void;
}

export function SignatureBottomSheet({
  title,
  open,
  confirmText = "확인",
  onOpenChange,
  onConfirm,
}: SignatureBottomSheetProps) {
  const [signature, setSignature] = useState("");

  useEffect(() => {
    setSignature("");
  }, [open]);

  const handleConfirm = () => {
    if (signature) {
      onConfirm(signature);
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="gap-0">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="mb-5 flex w-full px-5">
          <Signature onChange={setSignature} />
        </div>
        <SheetFooter>
          <Button
            className="h-14 w-full text-base"
            disabled={!signature}
            onClick={handleConfirm}
          >
            {confirmText}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
