import { Student } from "../types";
import { formatStudentDate } from "../utils";
import { UserAvatar } from "@/components/ui/user-avatar";

type Props = {
  student: Student;
  school: { name: string; logoUrl: string | null };
};

export function StudentIdCard({ student, school }: Props) {
  const formattedDob = formatStudentDate(student.dob);

  return (
    <div id="id-card-print-area">
      <div className="bg-white border border-border rounded-lg overflow-hidden flex flex-row w-full shadow-sm">
        <div className="flex w-8 shrink-0 items-center justify-center bg-brand overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element -- print-only card, not a routed page Next can optimize */}
          <img
            src={school.logoUrl ?? "/logo.png"}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>

        <div className="flex flex-1 flex-col gap-1.5 px-3 py-3">
          <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            {school.name}
          </p>

          <UserAvatar
            photoUrl={student.photoUrl}
            firstName={student.firstName}
            lastName={student.lastName}
            size="md"
            gradient="from-brand to-brand/80"
          />

          <p className="text-sm font-bold leading-tight">
            {student.firstName} {student.lastName}
          </p>

          <p className="text-xs text-muted-foreground">{student.slug}</p>

          <p className="text-xs text-muted-foreground">
            {student.className}&nbsp;·&nbsp;{student.division}
          </p>

          <p className="text-xs text-muted-foreground">DOB: {formattedDob}</p>

          <hr />

          <p className="text-xs text-center text-muted-foreground">{school.name} · Ghana</p>
        </div>
      </div>
    </div>
  );
}
