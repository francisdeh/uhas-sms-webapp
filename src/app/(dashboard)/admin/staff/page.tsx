import { UserCog } from "lucide-react";

export default function AdminStaffPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
      <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center">
        <UserCog size={26} className="text-muted-foreground" />
      </div>
      <div>
        <h1 className="text-lg font-semibold">Staff Management</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Full staff records — HR profiles, divisions, and employment details — are coming in Phase 2.
        </p>
      </div>
    </div>
  );
}
