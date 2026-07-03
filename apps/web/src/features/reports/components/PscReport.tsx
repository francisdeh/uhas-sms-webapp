import { formatDate as fmtDate } from "@/lib/dates";
import type { PscReportData } from "@/features/reports/types";

// PSC uses long month names ("5 January 2026") rather than the shared
// default ("5 Jan 2026") because the report is a printed document.
function formatDate(iso: string): string {
  return fmtDate(iso, "d MMMM yyyy");
}

export function PscReport({ data }: { data: PscReportData }) {
  const divisionTotals: Record<string, { boys: number; girls: number; total: number; classes: number }> = {};
  for (const r of data.classRows) {
    const d = divisionTotals[r.division] ?? { boys: 0, girls: 0, total: 0, classes: 0 };
    d.boys += r.boys;
    d.girls += r.girls;
    d.total += r.total;
    d.classes += 1;
    divisionTotals[r.division] = d;
  }

  return (
    <div id="report-card-print-area" className="bg-white text-black w-full max-w-[210mm] mx-auto p-8 font-serif">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold tracking-wide">{data.schoolName.toUpperCase()}</h1>
        <p className="text-base font-bold mt-1">PSC REPORT</p>
        <p className="text-sm mt-0.5">Snapshot as of {formatDate(data.asOf)}</p>
      </div>

      <div className="mb-5">
        <h2 className="text-sm font-bold mb-2 uppercase tracking-wide">School Totals</h2>
        <table className="w-full border-collapse border border-black text-sm">
          <tbody>
            <tr>
              <td className="border border-black p-1.5 font-bold w-[30%]">Students</td>
              <td className="border border-black p-1.5">{data.totals.students}</td>
              <td className="border border-black p-1.5 font-bold w-[20%]">Leavers (inactive)</td>
              <td className="border border-black p-1.5">{data.totals.leavers}</td>
            </tr>
            <tr>
              <td className="border border-black p-1.5 font-bold">Boys</td>
              <td className="border border-black p-1.5">{data.totals.boys}</td>
              <td className="border border-black p-1.5 font-bold">Girls</td>
              <td className="border border-black p-1.5">{data.totals.girls}</td>
            </tr>
            <tr>
              <td className="border border-black p-1.5 font-bold">Teachers</td>
              <td className="border border-black p-1.5">{data.totals.teachers}</td>
              <td className="border border-black p-1.5 font-bold">Admin staff</td>
              <td className="border border-black p-1.5">{data.totals.admins}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mb-5">
        <h2 className="text-sm font-bold mb-2 uppercase tracking-wide">Population by Class</h2>
        <table className="w-full border-collapse border border-black text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-black p-1.5 text-left">Class</th>
              <th className="border border-black p-1.5 text-left">Division</th>
              <th className="border border-black p-1.5 text-right">Boys</th>
              <th className="border border-black p-1.5 text-right">Girls</th>
              <th className="border border-black p-1.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.classRows.map((r) => (
              <tr key={r.classId}>
                <td className="border border-black p-1.5">{r.className}</td>
                <td className="border border-black p-1.5">{r.division}</td>
                <td className="border border-black p-1.5 text-right">{r.boys}</td>
                <td className="border border-black p-1.5 text-right">{r.girls}</td>
                <td className="border border-black p-1.5 text-right">{r.total}</td>
              </tr>
            ))}
            {Object.entries(divisionTotals).map(([division, d]) => (
              <tr key={`subtotal-${division}`} className="bg-gray-50">
                <td colSpan={2} className="border border-black p-1.5 font-bold">
                  {division} subtotal ({d.classes} class{d.classes === 1 ? "" : "es"})
                </td>
                <td className="border border-black p-1.5 text-right font-bold">{d.boys}</td>
                <td className="border border-black p-1.5 text-right font-bold">{d.girls}</td>
                <td className="border border-black p-1.5 text-right font-bold">{d.total}</td>
              </tr>
            ))}
            <tr className="bg-gray-200">
              <td colSpan={2} className="border border-black p-1.5 font-bold">
                School total
              </td>
              <td className="border border-black p-1.5 text-right font-bold">
                {data.totals.boys}
              </td>
              <td className="border border-black p-1.5 text-right font-bold">
                {data.totals.girls}
              </td>
              <td className="border border-black p-1.5 text-right font-bold">
                {data.totals.students}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mb-5">
        <h2 className="text-sm font-bold mb-2 uppercase tracking-wide">Teachers per Division</h2>
        {data.staffByDivision.map((d) => (
          <div key={d.division} className="mb-3">
            <p className="text-sm font-bold mb-1">
              {d.division} ({d.staff.length})
            </p>
            {d.staff.length === 0 ? (
              <p className="text-xs italic text-gray-600">No staff</p>
            ) : (
              <table className="w-full border-collapse border border-black text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-black p-1.5 text-left">Staff ID</th>
                    <th className="border border-black p-1.5 text-left">Name</th>
                    <th className="border border-black p-1.5 text-left">Rank</th>
                    <th className="border border-black p-1.5 text-left">Role flag</th>
                  </tr>
                </thead>
                <tbody>
                  {d.staff.map((s) => (
                    <tr key={s.id}>
                      <td className="border border-black p-1.5 font-mono text-xs">{s.id}</td>
                      <td className="border border-black p-1.5">{s.name}</td>
                      <td className="border border-black p-1.5">{s.rank}</td>
                      <td className="border border-black p-1.5">
                        {s.isUnitHead ? "Unit Head" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>

      <p className="text-center italic text-xs mt-6">
        Generated by the UHAS SMS — for internal use.
      </p>
    </div>
  );
}
