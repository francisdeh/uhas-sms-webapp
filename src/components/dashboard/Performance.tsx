"use client";

import { MoreHorizontal, TrendingUp, ChevronRight } from "lucide-react";
import { useState } from "react";

const tabs = ["New Users", "Online Sales", "Daily sales"];

const barData = [30, 50, 40, 65, 55, 80, 45];
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
              backgroundColor: i === 4 ? "#1E293B" : "#E5E7EB",
            }}
          />
          <span className="text-[9px] text-gray-400">{days[i]}</span>
        </div>
      ))}
    </div>
  );
}

export default function Performance() {
  const [activeTab, setActiveTab] = useState("New Users");

  return (
    <div className="bg-white rounded-xl p-5 border border-gray-100 flex-1">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-[#1E293B] text-sm">Performance</h3>
        <button className="text-gray-400 hover:text-gray-600">
          <MoreHorizontal size={16} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 mb-4 border-b border-gray-100">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`text-[11px] font-medium px-3 py-2 border-b-2 transition-colors -mb-px ${
              activeTab === t
                ? "border-[#1E293B] text-[#1E293B]"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* User card */}
      <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#10B981] to-[#3B82F6] flex items-center justify-center flex-shrink-0">
          <span className="text-white text-xs font-bold">AG</span>
        </div>
        <div>
          <p className="text-[10px] text-gray-400 font-medium">Product Manager</p>
          <p className="text-sm font-semibold text-[#1E293B]">Angel George</p>
        </div>
      </div>

      {/* Purchase info */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-1 rounded-md font-medium">Daily purchase</span>
        </div>
        <span className="text-sm font-bold text-[#1E293B]">10 Items</span>
      </div>

      {/* Physical product */}
      <div className="mb-3">
        <p className="text-[10px] text-gray-400 mb-1">Physical product</p>
        <div className="flex items-end justify-between">
          <p className="text-xl font-bold text-[#1E293B]">$78,263</p>
          <span className="flex items-center gap-0.5 text-[11px] font-semibold text-[#10B981]">
            <TrendingUp size={11} /> 14.78%
          </span>
        </div>
      </div>

      {/* Avatars + View all */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex -space-x-2">
          {["#F97316", "#10B981", "#3B82F6", "#8B5CF6"].map((c, i) => (
            <div
              key={i}
              className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center"
              style={{ backgroundColor: c }}
            >
              <span className="text-white text-[8px] font-bold">{["A", "B", "C", "D"][i]}</span>
            </div>
          ))}
        </div>
        <button className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700">
          View all <ChevronRight size={12} />
        </button>
      </div>

      {/* Promo text */}
      <p className="text-[10px] text-gray-500 mb-4 leading-relaxed">
        Increase <span className="font-semibold text-[#1E293B]">24%</span> More email marketing to reach your acquisition target.
      </p>

      {/* Bar chart */}
      <WeeklyBarChart />
    </div>
  );
}
