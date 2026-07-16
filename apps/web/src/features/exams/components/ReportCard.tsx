import { formatDate } from "@/lib/dates";
import {
  CONDUCT_TRAITS,
  CONDUCT_TRAIT_LABELS,
  KG_DOMAINS,
  KG_DOMAIN_LABELS,
  EXAM_TYPE,
  REPORT_CARD_VARIANT,
} from "@/features/exams/types";
import type {
  ReportCardData,
  ReportCardSubjectRow,
  ReportCardVariant,
} from "@/features/exams/types";

interface ReportCardProps {
  data: ReportCardData;
  /** "full" adds the CAT/project/group/exam component columns. */
  variant?: ReportCardVariant;
}

function fullName(firstName: string, middleName: string | undefined, lastName: string): string {
  return [firstName, middleName, lastName].filter(Boolean).join(" ");
}

function formatExamMonth(createdAt: string): string {
  return formatDate(createdAt, "MMMM yyyy").toUpperCase();
}

function isMidTerm(reportType: string): boolean {
  return reportType === EXAM_TYPE.MID_TERM;
}

function reportTitle(reportType: string, term: number): string {
  if (isMidTerm(reportType)) return `MID-TERM REPORT — TERM ${term}`;
  return `END OF TERM REPORT — TERM ${term}`;
}

export function ReportCard({ data, variant = REPORT_CARD_VARIANT.SUMMARY }: ReportCardProps) {
  const isMid = isMidTerm(data.exam.type);
  const full = variant === REPORT_CARD_VARIANT.FULL;
  const colSpan = full ? 10 : 5;
  const title = reportTitle(data.exam.type, data.exam.term);
  const monthYear = formatExamMonth(data.exam.createdAt);

  return (
    <div id="report-card-print-area" className="bg-white text-black w-full max-w-[210mm] mx-auto p-8 font-serif">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="w-20 h-20 rounded-full border-2 border-emerald-700 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element -- report card is a print/PDF surface, not a routed page Next can optimize */}
          <img
            src={data.schoolLogoUrl ?? "/logo.png"}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
        <div className="text-center flex-1 px-4">
          <h1 className="text-2xl font-bold tracking-wide">{data.schoolName.toUpperCase()}</h1>
          <p className="text-base font-bold mt-1">{title}</p>
          <p className="text-sm mt-0.5">{monthYear}</p>
        </div>
        {/* Balances the crest's width so the title block stays visually
            centered — there's no second real image (no school-seal
            field exists in the data model) to show here. */}
        <div className="w-20 h-20" />
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
          <InfoRow label="DATE" value={formatDate(new Date(), "dd/MM/yyyy")} />
          <InfoRow label="AGGREGATE" value={data.aggregate != null ? String(data.aggregate) : "—"} />
        </div>
        {(data.vacationDate || data.reopeningDate) && (
          <div className="grid grid-cols-3 gap-x-6">
            <InfoRow
              label="VACATION"
              value={data.vacationDate ? formatDate(data.vacationDate, "dd/MM/yyyy") : "—"}
            />
            <InfoRow
              label="REOPENING"
              value={data.reopeningDate ? formatDate(data.reopeningDate, "dd/MM/yyyy") : "—"}
            />
            <span />
          </div>
        )}
      </div>

      {/* Scores table — KG students get a developmental-observation
          checklist instead of numeric CAT/exam columns. */}
      {data.kgObservations ? (
        <KgObservationsTable observations={data.kgObservations} />
      ) : (
        <table className="w-full border-collapse border border-black text-sm mb-5">
          <thead>
            <tr>
              <th className={`border border-black p-1.5 text-left ${full ? "w-[22%]" : "w-[40%]"}`}>SUBJECTS</th>
              {full && (
                <>
                  <th className="border border-black p-1.5 text-center">CAT 1</th>
                  <th className="border border-black p-1.5 text-center">CAT 2</th>
                  <th className="border border-black p-1.5 text-center">PROJECT</th>
                  <th className="border border-black p-1.5 text-center">GROUP</th>
                  <th className="border border-black p-1.5 text-center">EXAM</th>
                </>
              )}
              <th className={`border border-black p-1.5 text-center ${full ? "w-[10%]" : "w-[18%]"}`}>{isMid ? "EXAM SCORE [100]" : "TOTAL SCORE [100]"}</th>
              <th className={`border border-black p-1.5 text-center ${full ? "w-[10%]" : "w-[14%]"}`}>SUBJECT POSITION</th>
              <th className={`border border-black p-1.5 text-center ${full ? "w-[8%]" : "w-[10%]"}`}>GRADE</th>
              <th className={`border border-black p-1.5 text-center ${full ? "w-[12%]" : "w-[18%]"}`}>INTERPRETATION</th>
            </tr>
          </thead>
          <tbody>
            <SectionHeader label="CORE SUBJECTS" colSpan={colSpan} />
            {data.coreRows.length === 0 ? (
              <EmptyRow colSpan={colSpan} />
            ) : (
              data.coreRows.map((row) => <ScoreRow key={row.subjectId} row={row} full={full} />)
            )}
            <SectionHeader label="ELECTIVE SUBJECTS" colSpan={colSpan} />
            {data.electiveRows.length === 0 ? (
              <EmptyRow colSpan={colSpan} />
            ) : (
              data.electiveRows.map((row) => <ScoreRow key={row.subjectId} row={row} full={full} />)
            )}
          </tbody>
        </table>
      )}

      {/* Conduct + interests — every division */}
      {(data.conductRatings || data.interestsCoCurricular) && (
        <table className="w-full border-collapse border border-black text-sm mb-5">
          <tbody>
            <tr>
              <td className="border border-black p-1.5 font-bold w-[30%] align-top">Conduct</td>
              <td className="border border-black p-1.5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1">
                  {CONDUCT_TRAITS.map((trait) => (
                    <span key={trait} className="text-xs">
                      <span className="font-semibold">{CONDUCT_TRAIT_LABELS[trait]}:</span>{" "}
                      {data.conductRatings?.[trait] ?? "—"}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
            <tr>
              <td className="border border-black p-1.5 font-bold align-top">
                Interests &amp; Co-curricular Activities
              </td>
              <td className="border border-black p-1.5 whitespace-pre-wrap">
                {data.interestsCoCurricular || ""}
              </td>
            </tr>
          </tbody>
        </table>
      )}

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
            <td className="border border-black p-1.5 font-bold">Head of School&apos;s Name</td>
            <td colSpan={4} className="border border-black p-1.5">{data.headOfSchoolName || "—"}</td>
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
            {data.gradingBands.map((band) => (
              <th key={band.grade} className="px-1 py-0.5 font-normal text-center">
                {band.min}-{band.max}
              </th>
            ))}
          </tr>
          <tr className="border-b border-black bg-gray-100">
            {data.gradingBands.map((band) => (
              <th key={band.grade} className="px-1 py-0.5 font-semibold text-center">
                {band.interpretation}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {data.gradingBands.map((band) => (
              <td key={band.grade} className="px-1 py-0.5 text-center">
                {band.grade}
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      {data.schoolMotto && <p className="text-center italic mt-6 text-sm">{data.schoolMotto}</p>}
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

function SectionHeader({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="border border-black p-1.5 text-center font-bold">
        {label}
      </td>
    </tr>
  );
}

function ScoreRow({ row, full }: { row: ReportCardSubjectRow; full: boolean }) {
  return (
    <tr>
      <td className="border border-black p-1.5">{row.subjectName}</td>
      {full && (
        <>
          <td className="border border-black p-1.5 text-center">{row.cat1 ?? ""}</td>
          <td className="border border-black p-1.5 text-center">{row.cat2 ?? ""}</td>
          <td className="border border-black p-1.5 text-center">{row.projectWork ?? ""}</td>
          <td className="border border-black p-1.5 text-center">{row.groupWork ?? ""}</td>
          <td className="border border-black p-1.5 text-center">{row.examScore ?? ""}</td>
        </>
      )}
      <td className="border border-black p-1.5 text-center">
        {row.totalScore ?? ""}
        {row.classAverage != null && (
          <div className="text-[9px] text-gray-500 font-normal">
            avg {row.classAverage.toFixed(1)}
          </div>
        )}
      </td>
      <td className="border border-black p-1.5 text-center">{row.subjectPosition ?? ""}</td>
      <td className="border border-black p-1.5 text-center">{row.grade ?? ""}</td>
      <td className="border border-black p-1.5 text-center">{row.interpretation ?? ""}</td>
    </tr>
  );
}

function EmptyRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="border border-black p-3 text-center text-xs text-gray-500 italic">
        No subjects in this section
      </td>
    </tr>
  );
}

function KgObservationsTable({
  observations,
}: {
  observations: NonNullable<ReportCardData["kgObservations"]>;
}) {
  return (
    <table className="w-full border-collapse border border-black text-sm mb-5">
      <thead>
        <tr>
          <th className="border border-black p-1.5 text-left w-[60%]">DEVELOPMENTAL AREA</th>
          <th className="border border-black p-1.5 text-center w-[40%]">OBSERVATION</th>
        </tr>
      </thead>
      <tbody>
        {KG_DOMAINS.map((domain) => (
          <tr key={domain}>
            <td className="border border-black p-1.5">{KG_DOMAIN_LABELS[domain]}</td>
            <td className="border border-black p-1.5 text-center">{observations[domain] ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
