"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Users, BookOpen, MessageSquare } from "lucide-react";

const courses = [
  {
    name: "UI/UX design",
    instructor: "John cartal",
    time: "19h 17m",
    progress: 50,
    score: "89/100",
    users: 14,
    books: 23,
    messages: 26,
    iconBg: "#FFF7ED",
    iconColor: "#F97316",
    icon: "🎨",
  },
  {
    name: "Web development",
    instructor: "Sara Mitchell",
    time: "20h 5m",
    progress: 75,
    score: "11/50",
    users: 15,
    books: 24,
    messages: 27,
    iconBg: "#EFF6FF",
    iconColor: "#3B82F6",
    icon: "</>",
  },
  {
    name: "Product management",
    instructor: "Alex Johnson",
    time: "21h 38m",
    progress: 25,
    score: "1/10",
    users: 16,
    books: 25,
    messages: 28,
    iconBg: "#FEF2F2",
    iconColor: "#EF4444",
    icon: "📦",
  },
  {
    name: "Graphic design",
    instructor: "Emily Chen",
    time: "22h 12m",
    progress: 50,
    score: "26/50",
    users: 17,
    books: 26,
    messages: 29,
    iconBg: "#F0FDF4",
    iconColor: "#10B981",
    icon: "✏️",
  },
  {
    name: "Data analysis",
    instructor: "Mark Robinson",
    time: "23h 45m",
    progress: 25,
    score: "76/100",
    users: 18,
    books: 27,
    messages: 30,
    iconBg: "#F5F3FF",
    iconColor: "#8B5CF6",
    icon: "📊",
  },
  {
    name: "Science of critical thinking",
    instructor: "Sophia Lee",
    time: "24h 30m",
    progress: 75,
    score: "12/50",
    users: 19,
    books: 28,
    messages: 31,
    iconBg: "#ECFDF5",
    iconColor: "#10B981",
    icon: "🔬",
  },
];

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-gray-500 w-7">{value}%</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-[#1E293B]"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function CourseIcon({ bg, color, icon }: { bg: string; color: string; icon: string }) {
  return (
    <div
      className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
      style={{ backgroundColor: bg }}
    >
      {icon === "</>" ? (
        <span className="font-bold text-[10px]" style={{ color }}>{"</>"}</span>
      ) : (
        <span>{icon}</span>
      )}
    </div>
  );
}

export default function CoursesTable() {
  const [currentPage, setCurrentPage] = useState(3);
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const toggleCheck = (i: number) => {
    const next = new Set(checked);
    next.has(i) ? next.delete(i) : next.add(i);
    setChecked(next);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 mb-6">
      {/* Table header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-[#1E293B] text-sm">Course you are taking</h3>
        <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <span className="text-[11px] text-gray-400">Search course</span>
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[32px_1fr_80px_180px_140px] items-center px-5 py-2 border-b border-gray-50">
        <div className="w-4 h-4 rounded border border-gray-300" />
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Course name</span>
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Time</span>
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Progress</span>
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Statistics</span>
      </div>

      {/* Rows */}
      {courses.map((c, i) => (
        <div
          key={i}
          className="grid grid-cols-[32px_1fr_80px_180px_140px] items-center px-5 py-3 border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
        >
          {/* Checkbox */}
          <div
            className={`w-4 h-4 rounded border cursor-pointer flex items-center justify-center ${
              checked.has(i) ? "bg-[#1E293B] border-[#1E293B]" : "border-gray-300"
            }`}
            onClick={() => toggleCheck(i)}
          >
            {checked.has(i) && (
              <svg width="10" height="10" viewBox="0 0 12 12" fill="white">
                <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              </svg>
            )}
          </div>

          {/* Course name */}
          <div className="flex items-center gap-2.5">
            <CourseIcon bg={c.iconBg} color={c.iconColor} icon={c.icon} />
            <div>
              <p className="text-[12px] font-semibold text-[#1E293B]">{c.name}</p>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-gray-200" />
                <span className="text-[10px] text-gray-400">{c.instructor}</span>
              </div>
            </div>
          </div>

          {/* Time */}
          <span className="text-[11px] text-gray-500">{c.time}</span>

          {/* Progress */}
          <div className="pr-4">
            <ProgressBar value={c.progress} />
            <span className="text-[10px] text-gray-400 ml-9">{c.score}</span>
          </div>

          {/* Statistics */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Users size={11} className="text-gray-400" />
              <span className="text-[11px] text-gray-500">{c.users}</span>
            </div>
            <div className="flex items-center gap-1">
              <BookOpen size={11} className="text-gray-400" />
              <span className="text-[11px] text-gray-500">{c.books}</span>
            </div>
            <div className="flex items-center gap-1">
              <MessageSquare size={11} className="text-gray-400" />
              <span className="text-[11px] text-gray-500">{c.messages}</span>
            </div>
          </div>
        </div>
      ))}

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3">
        <span className="text-[11px] text-gray-400">Showing 1 to 5 of 25 entries</span>
        <div className="flex items-center gap-1">
          <button className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-800 px-2 py-1">
            <ChevronLeft size={13} /> Previous
          </button>
          {[1, 2, 3, 4].map((p) => (
            <button
              key={p}
              onClick={() => setCurrentPage(p)}
              className={`w-7 h-7 rounded text-[11px] font-medium transition-colors ${
                currentPage === p
                  ? "bg-[#1E293B] text-white"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              {p}
            </button>
          ))}
          <button className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-800 px-2 py-1">
            Next <ChevronRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
