import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@superset/ui/utils";
import type { IconType } from "react-icons";
import {
  HiOutlineCube,
  HiOutlineWrenchScrewdriver,
  HiOutlineRocketLaunch,
  HiOutlineSparkles,
} from "react-icons/hi2";

const NAV_ITEMS = [
  { to: "/atlas/catalog", label: "Catalog", icon: HiOutlineCube as IconType },
  { to: "/atlas/studio", label: "Studio", icon: HiOutlineSparkles as IconType },
  {
    to: "/atlas/composer",
    label: "Composer",
    icon: HiOutlineWrenchScrewdriver as IconType,
  },
  {
    to: "/atlas/deployments",
    label: "Deployments",
    icon: HiOutlineRocketLaunch as IconType,
  },
] as const;

export function AtlasSidebar() {
  const location = useLocation();

  return (
    <div className="w-52 border-r border-border bg-muted/30 flex flex-col">
      <div className="p-4 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Features</h2>
      </div>
      <nav className="flex-1 p-2 space-y-0.5">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          const isActive = location.pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
