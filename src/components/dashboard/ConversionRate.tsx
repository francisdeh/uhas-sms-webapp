"use client";

import { MoreHorizontal, TrendingUp, TrendingDown } from "lucide-react";

function MiniAreaChart() {
  return (
    <svg width="100%" height="60" viewBox="0 0 200 60" fill="none" preserveAspectRatio="none">
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10B981" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0,45 C20,40 40,30 60,35 C80,40 100,20 120,15 C140,10 160,25 180,20 L200,18 L200,60 L0,60 Z"
        fill="url(#areaGrad)"
      />
      <path
        d="M0,45 C20,40 40,30 60,35 C80,40 100,20 120,15 C140,10 160,25 180,20 L200,18"
        stroke="#10B981"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

const metrics = [
  { label: "Impressions", sub: "12.2K Visits", delta: "+20.3%", positive: true },
  { label: "Added to cart", sub: "32 product in cart", delta: "+6.3%", positive: true },
  { label: "Checkout", sub: "15 Product checkout", delta: "-9.56%", positive: false },
];

export default function ConversionRate() {
  return (
    <div className="bg-white rounded-xl p-5 border border-gray-100 w-64 flex-shrink-0">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-[#1E293B] text-sm">Conversion rate</h3>
        <button className="text-gray-400 hover:text-gray-600">
          <MoreHorizontal size={16} />
        </button>
      </div>
      <p className="text-[10px] text-gray-400 mb-3">Compared to last month</p>

      {/* Big number */}
      <div className="flex items-end gap-2 mb-2">
        <span className="text-3xl font-bold text-[#1E293B]">92.8%</span>
        <span className="flex items-center gap-0.5 text-[11px] font-semibold text-[#10B981] mb-1">
          <TrendingUp size={11} /> 6.3%
        </span>
      </div>

      {/* Area chart */}
      <div className="mb-4 -mx-1">
        <MiniAreaChart />
      </div>

      {/* Metrics list */}
      <div className="space-y-3">
        {metrics.map((m) => (
          <div key={m.label} className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-[#1E293B]">{m.label}</p>
              <p className="text-[10px] text-gray-400">{m.sub}</p>
            </div>
            <span
              className={`flex items-center gap-0.5 text-[11px] font-semibold ${m.positive ? "text-[#10B981]" : "text-red-500"}`}
            >
              {m.positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              {m.delta}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
