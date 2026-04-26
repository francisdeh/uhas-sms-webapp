"use client";

import { ShoppingCart, DollarSign, Monitor, TrendingUp, TrendingDown } from "lucide-react";

const stats = [
  {
    label: "Total Enroll",
    value: "1.5k",
    delta: "-18%",
    positive: false,
    chart: "bars",
    barHeights: [40, 60, 45, 70, 55, 65, 50],
    barColor: "#1E293B",
  },
  {
    label: "Total Course",
    value: "2.5k",
    delta: "+6%",
    positive: true,
    chart: "bars",
    barHeights: [30, 50, 40, 65, 55, 70, 60],
    barColor: "#10B981",
  },
  {
    label: "Visitors",
    sub: "Last week",
    value: "75K",
    delta: "+18%",
    positive: true,
    chart: "line",
    lineColor: "#F97316",
    bigValue: "75K",
  },
  {
    label: "Course Purchases",
    value: "15K",
    delta: "+22%",
    positive: true,
    icon: "cart",
    iconBg: "#FFF7ED",
    iconColor: "#F97316",
  },
  {
    label: "Annual Revenue",
    value: "$8.34k",
    delta: "-16%",
    positive: false,
    icon: "dollar",
    iconBg: "#FFF7ED",
    iconColor: "#F97316",
  },
  {
    label: "New Course",
    value: "4,200",
    delta: "+38%",
    positive: true,
    icon: "monitor",
    iconBg: "#EFF6FF",
    iconColor: "#3B82F6",
  },
];

function MiniBarChart({ heights, color }: { heights: number[]; color: string }) {
  const max = Math.max(...heights);
  return (
    <div className="flex items-end gap-0.5 h-10">
      {heights.map((h, i) => (
        <div
          key={i}
          className="w-2.5 rounded-sm"
          style={{ height: `${(h / max) * 100}%`, backgroundColor: color, opacity: 0.7 + (i === heights.length - 2 ? 0.3 : 0) }}
        />
      ))}
    </div>
  );
}

function MiniLineChart({ color }: { color: string }) {
  const points = "0,35 15,25 30,30 45,15 60,20 75,10 90,18 105,8";
  return (
    <svg width="110" height="40" viewBox="0 0 110 40" fill="none">
      <polyline points={points} stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconStat({ iconBg, iconColor, icon }: { iconBg: string; iconColor: string; icon: string }) {
  return (
    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: iconBg }}>
      {icon === "cart" && <ShoppingCart size={16} style={{ color: iconColor }} />}
      {icon === "dollar" && <DollarSign size={16} style={{ color: iconColor }} />}
      {icon === "monitor" && <Monitor size={16} style={{ color: iconColor }} />}
    </div>
  );
}

export default function StatsRow() {
  return (
    <div className="grid grid-cols-6 gap-4 mb-5">
      {stats.map((s, i) => (
        <div key={i} className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="flex items-start justify-between mb-2">
            <div>
              {s.sub && <p className="text-[10px] text-gray-400 mb-0.5">{s.sub}</p>}
              <p className="text-[11px] font-medium text-gray-500">{s.label}</p>
            </div>
            {s.icon && <IconStat iconBg={s.iconBg!} iconColor={s.iconColor!} icon={s.icon} />}
          </div>

          {s.chart === "line" && (
            <div className="my-1">
              <MiniLineChart color={s.lineColor!} />
            </div>
          )}

          <div className="flex items-end justify-between mt-1">
            <p className="text-xl font-bold text-[#1E293B]">{s.value}</p>
            <span
              className={`flex items-center gap-0.5 text-[11px] font-semibold ${s.positive ? "text-[#10B981]" : "text-red-500"}`}
            >
              {s.positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              {s.delta}
            </span>
          </div>

          {s.chart === "bars" && (
            <div className="mt-2">
              <MiniBarChart heights={s.barHeights!} color={s.barColor!} />
            </div>
          )}

          {s.icon && (
            <div className="mt-1">
              <span className="text-[10px] text-gray-400">Last 6 months</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
