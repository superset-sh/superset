import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@superbuilder/feature-ui/shadcn/card";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@superbuilder/feature-ui/shadcn/field";
import { Input } from "@superbuilder/feature-ui/shadcn/input";
import { Checkbox } from "@superbuilder/feature-ui/shadcn/checkbox";

interface Props {}

export function FieldCard({}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Field</CardTitle>
        <CardDescription>@superbuilder/feature-ui/shadcn/field</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Vertical
          </h4>
          <Field orientation="vertical">
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" type="email" placeholder="Enter your email" />
            <FieldDescription>We will never share your email.</FieldDescription>
          </Field>
        </section>
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            With Error
          </h4>
          <Field orientation="vertical" data-invalid="true">
            <FieldLabel htmlFor="email-error">Email</FieldLabel>
            <Input
              id="email-error"
              type="email"
              placeholder="Enter your email"
              aria-invalid="true"
            />
            <FieldError>Please enter a valid email address.</FieldError>
          </Field>
        </section>
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Horizontal
          </h4>
          <Field orientation="horizontal">
            <Checkbox id="agree" />
            <FieldLabel htmlFor="agree">
              I agree to the terms and conditions
            </FieldLabel>
          </Field>
        </section>
      </CardContent>
    </Card>
  );
}
