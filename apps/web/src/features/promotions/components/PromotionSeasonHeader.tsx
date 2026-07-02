"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { ApiError } from "@/lib/api/browser";
import {
  useOpenPromotionSeason,
  useClosePromotionSeason,
} from "@/features/promotions/hooks/use-promotions";
import {
  PROMOTION_SEASON_STATUS,
  type PromotionSeason,
} from "@/features/promotions/types";

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
  const openMut = useOpenPromotionSeason();
  const closeMut = useClosePromotionSeason();
  const isPending = openMut.isPending || closeMut.isPending;
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  // Staff identity is derived from the JWT server-side now.
  void staffId;

  const isOpen = season?.status === PROMOTION_SEASON_STATUS.OPEN;

  async function performOpen(override: boolean) {
    try {
      await openMut.mutateAsync({ override });
      setOverrideOpen(false);
      router.refresh();
    } catch (err) {
      // The service returns 400 with a specific message when the
      // Term-3 exam isn't published and `override=false`. Pop the
      // confirmation dialog so the Admin can retry with override.
      if (
        err instanceof ApiError &&
        err.status === 400 &&
        err.message.includes("Term 3 End-of-Term")
      ) {
        setOverrideOpen(true);
      }
    }
  }

  function handleOpenClick() {
    void performOpen(false);
  }

  async function handleClose() {
    try {
      await closeMut.mutateAsync();
      setCloseOpen(false);
      router.refresh();
    } catch {
      /* toast fired inside the hook */
    }
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
            <AlertDialogAction onClick={() => void performOpen(true)} disabled={isPending}>
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
