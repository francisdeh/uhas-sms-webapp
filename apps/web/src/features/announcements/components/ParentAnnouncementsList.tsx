import { AlertTriangle, Megaphone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { audienceLabel } from "@/features/announcements/types";
import type { Announcement } from "@/features/announcements/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ParentAnnouncementsList({
  announcements,
  classes,
}: {
  announcements: Announcement[];
  classes?: { id: string; name: string }[];
}) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Announcements</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          School-wide and class-specific notices relevant to your child(ren).
        </p>
      </div>

      {announcements.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements right now"
          description="School-wide notices and updates relevant to your child's class will appear here when they're posted."
        />
      ) : (
        <div className="space-y-2">
          {announcements.map((a) => (
            <Card key={a.id}>
              <CardContent className="py-3.5 space-y-1.5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold">{a.title}</p>
                    {a.isCritical && (
                      <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-[10px]">
                        <AlertTriangle size={10} className="mr-1" /> Critical
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-[10px]">
                      {audienceLabel(a.audience, classes)}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDate(a.createdAt)}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{a.body}</p>
                <p className="text-xs text-muted-foreground">By {a.createdByName}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
