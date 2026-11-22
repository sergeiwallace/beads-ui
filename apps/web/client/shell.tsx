import {
  ChartGantt,
  ChartLine,
  CircleUser,
  Command,
  Ellipsis,
  Inbox,
  ListOrdered,
  ListTodo,
  LogOut,
  type LucideIcon,
  SquareKanban,
  Timer,
  TriangleAlert,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { OVERFLOW_ITEM, useOverflowItems } from "@/hooks/use-overflow-items";

export interface ViewLink {
  view: string;
  label: string;
  href: string;
  current: boolean;
  go: () => void;
}

const ICONS: Readonly<Record<string, LucideIcon>> = {
  board: SquareKanban,
  backlog: ListTodo,
  roadmap: ChartGantt,
  analytics: ChartLine,
  sessions: Users,
  review: Inbox,
  sprints: Timer,
  queue: ListOrdered,
};

export function AppSidebar({ views }: { views: readonly ViewLink[] }) {
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex h-8 items-center gap-2 px-1.5 font-semibold">
          <img src="./icon.svg" alt="" className="size-5 shrink-0" />
          <span className="truncate group-data-[collapsible=icon]:hidden">beads-ui</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Views">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {views.map((entry) => {
                  const Icon = ICONS[entry.view] ?? SquareKanban;
                  return (
                    <SidebarMenuItem key={entry.view}>
                      <SidebarMenuButton
                        isActive={entry.current}
                        tooltip={entry.label}
                        render={
                          <a
                            href={entry.href}
                            aria-current={entry.current ? "page" : undefined}
                            onClick={(event) => {
                              if (
                                event.metaKey ||
                                event.ctrlKey ||
                                event.shiftKey ||
                                event.button !== 0
                              )
                                return;
                              event.preventDefault();
                              if (isMobile) setOpenMobile(false);
                              entry.go();
                            }}
                          />
                        }
                      >
                        <Icon aria-hidden="true" />
                        <span>{entry.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>
    </Sidebar>
  );
}

export interface BarAction {
  id: string;
  bar: ReactNode;
  menu: ReactNode;
}

export function OverflowActions({ actions }: { actions: readonly BarAction[] }) {
  const { row, hidden } = useOverflowItems(actions.map((action) => action.id));
  const overflowed = actions.filter((action) => hidden.has(action.id));
  return (
    <>
      <div
        ref={row}
        className="flex h-(--bar-control) min-w-0 flex-1 flex-row-reverse flex-wrap content-start items-center gap-2 overflow-hidden"
      >
        {actions.map((action) => {
          const out = hidden.has(action.id);
          return (
            <div
              key={action.id}
              {...{ [OVERFLOW_ITEM]: action.id }}
              data-overflowed={out ? "" : undefined}
              aria-hidden={out ? true : undefined}
              inert={out}
              className="flex h-(--bar-control) shrink-0 items-center data-overflowed:invisible"
            >
              {action.bar}
            </div>
          );
        })}
      </div>
      {overflowed.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="More"
                className="pointer-coarse:size-11"
              />
            }
          >
            <Ellipsis aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto min-w-48">
            {overflowed.map((action) => (
              <DropdownMenuGroup key={action.id}>{action.menu}</DropdownMenuGroup>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
}

export function CommandsButton({ onOpen }: { onOpen: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-keyshortcuts="Control+K Meta+K"
            className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
            onClick={onOpen}
          />
        }
      >
        <Command aria-hidden="true" />
        <span className="sr-only @3xl/bar:not-sr-only">Commands</span>
        <kbd className="hidden font-mono text-xs text-muted-foreground @3xl/bar:inline">Ctrl K</kbd>
      </TooltipTrigger>
      <TooltipContent>Commands (Ctrl K)</TooltipContent>
    </Tooltip>
  );
}

export function StaleNotice({ text }: { text: string }) {
  return (
    <span
      className="app-stale flex min-w-0 shrink items-center gap-1 text-xs text-muted-foreground"
      role="status"
      title={text}
    >
      <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-(--bu-warning)" />
      <span className="sr-only @5xl/bar:not-sr-only @5xl/bar:truncate">{text}</span>
    </span>
  );
}

export function AccountMenu({ onSignOut }: { onSignOut: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Account"
            className="pointer-coarse:size-11"
          />
        }
      >
        <CircleUser aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-40">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Account</DropdownMenuLabel>
          <DropdownMenuItem onClick={onSignOut}>
            <LogOut aria-hidden="true" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
