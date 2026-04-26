"use client";

import { MoreHorizontal, TrendingUp } from "lucide-react";

const earningData = [
  { label: "Net profit", sub: "Sales", value: "$1,623", delta: "+20.3%", icon: "💰" },
  { label: "Total income", sub: "Sales, Affiliation", value: "$5,600", delta: "+16.2%", icon: "💵" },
  { label: "Total expense", sub: "ADVT, Marketing", value: "$3,200", delta: "+10.5%", icon: "📊" },
];

const barData = [25, 45, 35, 60, 50, 75, 40];
const days = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

function WeeklyBarChart() {
  const max = Math.max(...barData);
  return (
    <div className="flex items-end gap-1.5 h-16">
      {barData.map((h, i) => (
        <div key={i} className="flex flex-col items-center gap-1 flex-1">
          <div
            className="w-full rounded-sm"
            style={{
              height: `${(h / max) * 100}%`,
              backgroundColor: i === 5 ? "#1E293B" : "#E5E7EB",
            }}
          />
          <span className="text-[9px] text-gray-400">{days[i]}</span>
        </div>
      ))}
    </div>
  );
}

export default function EarningReport() {
  return (
    <div className="bg-white rounded-xl p-5 border border-gray-100 flex-1">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-[#1E293B] text-sm">Earning Report</h3>
        <button className="text-gray-400 hover:text-gray-600">
          <MoreHorizontal size={16} />
        </button>
      </div>
      <p className="text-[10px] text-gray-400 mb-4">Weekly Earning overview</p>

      <div className="space-y-3 mb-4">
        {earningData.map((e) => (
          <div key={e.label} className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-sm flex-shrink-0">
              {e.icon}
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[#1E293B]">{e.label}</p>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-[#1E293B]">{e.value}</span>
                  <span className="flex items-center gap-0.5 text-[10px] font-semibold text-[#10B981]">
                    <TrendingUp size={9} /> {e.delta}
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-gray-400">{e.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <WeeklyBarChart />
    </div>
  );
}
