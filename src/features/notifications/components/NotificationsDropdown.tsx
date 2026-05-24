"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getBellDataAction,
  markAllAsReadAction,
  type BellData,
} from "@/features/notifications/actions";

const POLL_INTERVAL_MS = 60_000;
const MAX_BADGE = 9;

export function NotificationsDropdown() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data, isPending } = useQuery<BellData | null>({
    queryKey: ["bell-data"],
    queryFn: () => getBellDataAction(),
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });

  const markAll = useMutation({
    mutationFn: markAllAsReadAction,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bell-data"] }),
  });

  const unreadCount = data?.unreadCount ?? 0;
  const items = data?.items ?? [];

  // "Open = saw it." When the dropdown opens, mark everything unread as read.
  // We do this once per transition to open, not on every render.
  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && unreadCount > 0) {
      markAll.mutate();
    }
  }

  function onItemClick(link: string | null) {
    setOpen(false);
    if (link) router.push(link);
  }

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        className="relative h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        <Bell size={15} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-accent-orange text-white text-[10px] font-semibold leading-none">
            {unreadCount > MAX_BADGE ? `${MAX_BADGE}+` : unreadCount}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center justify-between py-2.5">
            <span className="font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <Badge className="bg-accent-orange/10 text-accent-orange border-0 text-xs px-1.5">
                {unreadCount} new
              </Badge>
            )}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />

        {isPending && items.length === 0 ? (
          <div className="py-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="px-3 py-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-1.5 w-1.5 rounded-full" />
                  <Skeleton className="h-3.5 flex-1" />
                  <Skeleton className="h-2.5 w-8" />
                </div>
                <Skeleton className="h-3 w-4/5 ml-3.5" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 px-4 text-center">
            <BellOff size={20} className="text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">No notifications yet</p>
            <p className="text-xs text-muted-foreground/70">
              You&apos;ll see updates here when things happen.
            </p>
          </div>
        ) : (
          items.map((n) => {
            const isUnread = n.readAt == null;
            return (
              <DropdownMenuGroup key={n.id}>
                <DropdownMenuItem
                  className="flex-col items-start gap-0.5 py-3 cursor-pointer px-3"
                  onClick={() => onItemClick(n.link)}
                >
                  <div className="flex items-center gap-2 w-full">
                    {isUnread && (
                      <span className="h-1.5 w-1.5 rounded-full bg-accent-orange flex-shrink-0" />
                    )}
                    <span
                      className={`text-sm flex-1 ${
                        isUnread ? "font-medium" : "font-normal text-muted-foreground"
                      }`}
                    >
                      {n.title}
                    </span>
                    <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                      {formatRelative(new Date(n.createdAt))}
                    </span>
                  </div>
                  <p
                    className={`text-xs leading-relaxed ${isUnread ? "pl-3.5" : "pl-3.5 text-muted-foreground"}`}
                  >
                    {n.body}
                  </p>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            );
          })
        )}

        {items.length > 0 && unreadCount > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                className="justify-center cursor-pointer py-2.5"
                onSelect={(e) => {
                  e.preventDefault();
                  markAll.mutate();
                }}
              >
                <CheckCheck size={13} className="mr-1.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Mark all as read</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function formatRelative(date: Date): string {
  const diff = Date.now() - date.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
