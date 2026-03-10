import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@superbuilder/feature-ui/shadcn/card";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@superbuilder/feature-ui/shadcn/command";
import {
  CalendarIcon,
  SettingsIcon,
  UserIcon,
  CreditCardIcon,
} from "lucide-react";

interface Props {}

export function CommandCard({}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Command</CardTitle>
        <CardDescription>@superbuilder/feature-ui/shadcn/command</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Default
          </h4>
          <Command className="rounded-lg border">
            <CommandInput placeholder="Type a command or search..." />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              <CommandGroup heading="Suggestions">
                <CommandItem>
                  <CalendarIcon />
                  <span>Calendar</span>
                </CommandItem>
                <CommandItem>
                  <UserIcon />
                  <span>Search Users</span>
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Settings">
                <CommandItem>
                  <SettingsIcon />
                  <span>Settings</span>
                </CommandItem>
                <CommandItem>
                  <CreditCardIcon />
                  <span>Billing</span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </section>
      </CardContent>
    </Card>
  );
}
