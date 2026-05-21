"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Play, Pause, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  openPromotionSeasonAction,
  closePromotionSeasonAction,
} from "@/features/promotions/actions";
import type { PromotionSeason } from "@/features/promotions/types";

type Props = {
  season: PromotionSeason | null;
  academicYear: string;
  staffId: string;
  term3EndOfTermPublished: boolean;
};

export function PromotionSeasonHeader({
  season,
  academicYear,
  staffId,
  term3EndOfTermPublished,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  const isOpen = season?.status === "open";

  function performOpen(override: boolean) {
    startTransition(async () => {
      const result = await openPromotionSeasonAction({
        openedById: staffId,
        override,
      });
      if (!result.success) {
        if (result.requiresOverride) {
          setOverrideOpen(true);
          return;
        }
        toast.error(result.error);
        return;
      }
      setOverrideOpen(false);
      toast.success(
        result.openedWithOverride
          ? "Season opened in override mode."
          : "Promotion season opened."
      );
      router.refresh();
    });
  }

  function handleOpenClick() {
    performOpen(false);
  }

  function handleClose() {
    startTransition(async () => {
      const result = await closePromotionSeasonAction({ closedById: staffId });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setCloseOpen(false);
      toast.success("Promotion season closed.");
      router.refresh();
    });
  }

  return (
    <>
      <Card>
        <CardContent className="py-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium">Promotion Season {academicYear}</p>
                {isOpen ? (
                  season.openedWithOverride ? (
                    <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                      <AlertTriangle size={11} className="mr-1" />
                      Open (override)
                    </Badge>
                  ) : (
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                      Open
                    </Badge>
                  )
                ) : (
                  <Badge variant="secondary">Closed</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {isOpen
                  ? `Opened by ${season.openedByName ?? "—"} on ${new Date(season.openedAt!).toLocaleDateString()}`
                  : "Class teachers can only act on promotion lists while the season is open."}
              </p>
            </div>

            {isOpen ? (
              <Button variant="outline" onClick={() => setCloseOpen(true)} disabled={isPending}>
                <Pause size={14} className="mr-1.5" />
                Close season
              </Button>
            ) : (
              <Button onClick={handleOpenClick} disabled={isPending}>
                {isPending ? (
                  <Loader2 size={14} className="animate-spin mr-1.5" />
                ) : (
                  <Play size={14} className="mr-1.5" />
                )}
                Open promotion season
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Open without Term-3 results?</AlertDialogTitle>
            <AlertDialogDescription>
              Term 3 End-of-Term exam is not published yet. Without it, the system can&apos;t suggest
              Promote/Repeat — class teachers will see no algorithmic default and must decide every
              student manually. Open anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => performOpen(true)} disabled={isPending}>
              {isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
              Open with override
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={closeOpen} onOpenChange={setCloseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close promotion season?</AlertDialogTitle>
            <AlertDialogDescription>
              Closing pauses all unfinished promotion lists. Approved submissions are unaffected.
              You can reopen the season any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClose} disabled={isPending}>
              {isPending && <Loader2 size={14} className="animate-spin mr-1.5" />}
              Close season
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {!isOpen && !term3EndOfTermPublished && (
        <p className="text-xs text-muted-foreground mt-2 sm:mt-3">
          <AlertTriangle size={11} className="inline mr-1 -mt-0.5" />
          Term 3 End-of-Term exam isn&apos;t published yet — opening now will require override.
        </p>
      )}
    </>
  );
}
