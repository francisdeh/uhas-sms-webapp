"use client";

import { MoreHorizontal } from "lucide-react";

const services = [
  { name: "UI design", pct: 89, color: "#F97316" },
  { name: "UX design", pct: 80, color: "#10B981" },
  { name: "Music", pct: 70, color: "#1E293B" },
  { name: "Animation", pct: 62, color: "#3B82F6" },
  { name: "React", pct: 40, color: "#EF4444" },
  { name: "SEO", pct: 34, color: "#1E293B" },
];

const legend = [
  { label: "UI design", pct: "89%", color: "#F97316" },
  { label: "UX design", pct: "80%", color: "#10B981" },
  { label: "Music", pct: "70%", color: "#1E293B" },
  { label: "Animation", pct: "62%", color: "#3B82F6" },
  { label: "React", pct: "40%", color: "#EF4444" },
  { label: "SEO", pct: "34%", color: "#6B7280" },
];

export default function TopServices() {
  return (
    <div className="bg-white rounded-xl p-5 border border-gray-100 flex-1">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-[#1E293B] text-sm">Top Services by Sales</h3>
        <button className="text-gray-400 hover:text-gray-600">
          <MoreHorizontal size={16} />
        </button>
      </div>

      <div className="flex gap-6">
        {/* Chart area */}
        <div className="flex-1 space-y-3">
          {services.map((s, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs text-gray-400 w-3">{i + 1}</span>
              <div className="flex-1 relative">
                <div
                  className="h-6 rounded-md flex items-center px-2"
                  style={{ width: `${s.pct}%`, backgroundColor: s.color }}
                >
                  <span className="text-white text-[11px] font-medium truncate">{s.name}</span>
                </div>
              </div>
            </div>
          ))}
          {/* X-axis labels */}
          <div className="flex justify-between pt-1 pl-6">
            {["0%", "25%", "50%", "75%", "100%"].map((l) => (
              <span key={l} className="text-[10px] text-gray-400">{l}</span>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="w-28 space-y-2">
          {legend.map((l) => (
            <div key={l.label} className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: l.color }} />
                <span className="text-[11px] text-gray-500">{l.label}</span>
              </div>
              <span className="text-[11px] font-semibold text-gray-700">{l.pct}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
