import { GES_GRADES } from "@/features/exams/utils";
import type { ReportCardData, ReportCardSubjectRow } from "@/features/exams/queries/get-report-card";

interface ReportCardProps {
  data: ReportCardData;
}

function fullName(firstName: string, middleName: string | undefined, lastName: string): string {
  return [firstName, middleName, lastName].filter(Boolean).join(" ");
}

function formatExamMonth(createdAt: string): string {
  const d = new Date(createdAt);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }).toUpperCase();
}

function isMidTerm(reportType: string): boolean {
  return reportType === "MidTerm";
}

function reportTitle(reportType: string, term: number): string {
  if (isMidTerm(reportType)) return `MID-TERM REPORT — TERM ${term}`;
  return `END OF TERM REPORT — TERM ${term}`;
}

export function ReportCard({ data }: ReportCardProps) {
  const isMid = isMidTerm(data.exam.type);
  const title = reportTitle(data.exam.type, data.exam.term);
  const monthYear = formatExamMonth(data.exam.createdAt);

  return (
    <div id="report-card-print-area" className="bg-white text-black w-full max-w-[210mm] mx-auto p-8 font-serif">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="w-20 h-20 rounded-full bg-emerald-100 border-2 border-emerald-700 flex items-center justify-center text-emerald-800 text-xs font-bold text-center leading-tight">
          UHAS<br />CREST
        </div>
        <div className="text-center flex-1 px-4">
          <h1 className="text-2xl font-bold tracking-wide">UHAS BASIC SCHOOL</h1>
          <p className="text-base font-bold mt-1">{title}</p>
          <p className="text-sm mt-0.5">{monthYear}</p>
        </div>
        <div className="w-20 h-20 rounded-full bg-emerald-50 border-2 border-emerald-700 flex items-center justify-center text-emerald-800 text-[10px] font-bold text-center leading-tight">
          UHAS<br />SEAL
        </div>
      </div>

      {/* Student info row */}
      <div className="space-y-2 mb-5">
        <InfoRow label="STUDENT NAME" value={fullName(data.student.firstName, data.student.middleName, data.student.lastName).toUpperCase()} wide />
        <div className="grid grid-cols-3 gap-x-6">
          <InfoRow label="BASIC" value={data.className} />
          <InfoRow label="NUMBER ON ROLL" value={String(data.numberOnRoll)} />
          <InfoRow label="TERM" value={String(data.exam.term)} />
        </div>
        <div className="grid grid-cols-3 gap-x-6">
          <InfoRow label="YEAR" value={data.exam.academicYear} />
          <InfoRow label="DATE" value={new Date().toLocaleDateString("en-GB")} />
          <InfoRow label="AGGREGATE" value={data.aggregate != null ? String(data.aggregate) : "—"} />
        </div>
      </div>

      {/* Scores table */}
      <table className="w-full border-collapse border border-black text-sm mb-5">
        <thead>
          <tr>
            <th className="border border-black p-1.5 text-left w-[40%]">SUBJECTS</th>
            <th className="border border-black p-1.5 text-center w-[18%]">{isMid ? "EXAM SCORE [100]" : "TOTAL SCORE [100]"}</th>
            <th className="border border-black p-1.5 text-center w-[14%]">SUBJECT POSITION</th>
            <th className="border border-black p-1.5 text-center w-[10%]">GRADE</th>
            <th className="border border-black p-1.5 text-center w-[18%]">INTERPRETATION</th>
          </tr>
        </thead>
        <tbody>
          <SectionHeader label="CORE SUBJECTS" />
          {data.coreRows.length === 0 ? (
            <EmptyRow />
          ) : (
            data.coreRows.map((row) => <ScoreRow key={row.subjectId} row={row} />)
          )}
          <SectionHeader label="ELECTIVE SUBJECTS" />
          {data.electiveRows.length === 0 ? (
            <EmptyRow />
          ) : (
            data.electiveRows.map((row) => <ScoreRow key={row.subjectId} row={row} />)
          )}
        </tbody>
      </table>

      {/* Attendance + signatures */}
      <table className="w-full border-collapse border border-black text-sm mb-5">
        <tbody>
          <tr>
            <td className="border border-black p-1.5 font-bold w-[30%]">ATTENDANCE</td>
            <td className="border border-black p-1.5 w-[10%]">{data.attendance.attended}</td>
            <td className="border border-black p-1.5 font-bold w-[10%]">OUT OF</td>
            <td className="border border-black p-1.5 w-[10%]">{data.attendance.total}</td>
            <td className="border border-black p-1.5"></td>
          </tr>
          <tr>
            <td className="border border-black p-1.5 font-bold align-top">Class Teachers&apos; Remarks</td>
            <td colSpan={4} className="border border-black p-1.5 min-h-[2.5rem] whitespace-pre-wrap">
              {data.classTeacherRemark || ""}
            </td>
          </tr>
          <tr>
            <td className="border border-black p-1.5 font-bold">Class Teachers&apos; Names</td>
            <td colSpan={4} className="border border-black p-1.5">{data.classTeacherNames.join(", ") || "—"}</td>
          </tr>
          <tr>
            <td className="border border-black p-1.5 font-bold">Class Teachers&apos; Signature</td>
            <td colSpan={4} className="border border-black p-1.5 h-8"></td>
          </tr>
          <tr>
            <td className="border border-black p-1.5 font-bold align-top">Head of School&apos;s Comment</td>
            <td colSpan={4} className="border border-black p-1.5 min-h-[2.5rem] whitespace-pre-wrap">
              {data.headOfSchoolComment || ""}
            </td>
          </tr>
          <tr>
            <td className="border border-black p-1.5 font-bold">Head of School&apos;s Signature</td>
            <td colSpan={4} className="border border-black p-1.5 h-8"></td>
          </tr>
        </tbody>
      </table>

      {/* Grading scale legend */}
      <div className="text-center text-sm font-bold mb-2">INTERPRETATION OF THE GRADING SYSTEM</div>
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="border-b border-black">
            {GES_GRADES.map((band) => (
              <th key={band.grade} className="px-1 py-0.5 font-normal text-center">
                {band.max}-{band.min}
              </th>
            ))}
          </tr>
          <tr className="border-b border-black bg-gray-100">
            {GES_GRADES.map((band) => (
              <th key={band.grade} className="px-1 py-0.5 font-semibold text-center">
                {band.interpretation}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {GES_GRADES.map((band) => (
              <td key={band.grade} className="px-1 py-0.5 text-center">
                {band.grade}
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      <p className="text-center italic mt-6 text-sm">Learning Today, Leading Tomorrow</p>
    </div>
  );
}

function InfoRow({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <p className={wide ? "text-sm" : "text-sm"}>
      <span className="font-bold">{label}:</span> {value || "—"}
    </p>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <tr>
      <td colSpan={5} className="border border-black p-1.5 text-center font-bold">
        {label}
      </td>
    </tr>
  );
}

function ScoreRow({ row }: { row: ReportCardSubjectRow }) {
  return (
    <tr>
      <td className="border border-black p-1.5">{row.subjectName}</td>
      <td className="border border-black p-1.5 text-center">{row.totalScore ?? ""}</td>
      <td className="border border-black p-1.5 text-center">{row.subjectPosition ?? ""}</td>
      <td className="border border-black p-1.5 text-center">{row.grade ?? ""}</td>
      <td className="border border-black p-1.5 text-center">{row.interpretation ?? ""}</td>
    </tr>
  );
}

function EmptyRow() {
  return (
    <tr>
      <td colSpan={5} className="border border-black p-3 text-center text-xs text-gray-500 italic">
        No subjects in this section
      </td>
    </tr>
  );
}
