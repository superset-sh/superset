import { type Button as ButtonPrimitive } from "@base-ui/react/button";
import { Button } from "../../_shadcn/button";
import { type Prettify } from "../../lib/utils";

interface Props extends Prettify<ButtonPrimitive.Props> {
  variant?: Variant;
}

export function ScaffoldCTAButton(props: Props) {
  return <Button {...props} size="lg" className="h-14" />;
}

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

type Variant = React.ComponentProps<typeof Button>["variant"];
