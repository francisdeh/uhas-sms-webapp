"use client";

import { MoreHorizontal } from "lucide-react";

const payments = [
  { card: "*8562", type: "Debit card", network: "visa", date: "10/Apr", amount: "-$750", total: "$5,120" },
  { card: "*5688", type: "Credit card", network: "mc", date: "25/May", amount: "-$1,200", total: "$5,870" },
  { card: "*5238", type: "ATM card", network: "mc", date: "20/Mar", amount: "-$500", total: "$1,010" },
  { card: "*8562", type: "Debit card", network: "visa", date: "15/Feb", amount: "-$1,450", total: "$8,570" },
  { card: "*5688", type: "Credit card", network: "mc", date: "05/Jan", amount: "-$2,820", total: "$10,020" },
];

function VisaLogo() {
  return (
    <div className="w-8 h-5 bg-[#1A1F71] rounded flex items-center justify-center">
      <span className="text-white text-[9px] font-bold italic">VISA</span>
    </div>
  );
}

function MCLogo() {
  return (
    <div className="w-8 h-5 flex items-center justify-center">
      <div className="flex -space-x-1.5">
        <div className="w-3.5 h-3.5 rounded-full bg-[#EB001B] opacity-90" />
        <div className="w-3.5 h-3.5 rounded-full bg-[#F79E1B] opacity-90" />
      </div>
    </div>
  );
}

export default function PaymentHistory() {
  return (
    <div className="bg-white rounded-xl p-5 border border-gray-100 flex-1">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-[#1E293B] text-sm">Payment History</h3>
        <button className="text-gray-400 hover:text-gray-600">
          <MoreHorizontal size={16} />
        </button>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-3 mb-2 px-1">
        <span className="text-[10px] font-semibold text-gray-400 uppercase">Card</span>
        <span className="text-[10px] font-semibold text-gray-400 uppercase text-center">Date</span>
        <span className="text-[10px] font-semibold text-gray-400 uppercase text-right">Spend</span>
      </div>

      <div className="space-y-2.5">
        {payments.map((p, i) => (
          <div key={i} className="grid grid-cols-3 items-center py-1.5 border-t border-gray-50">
            {/* Card */}
            <div className="flex items-center gap-2">
              {p.network === "visa" ? <VisaLogo /> : <MCLogo />}
              <div>
                <p className="text-[11px] font-semibold text-[#1E293B]">{p.card}</p>
                <p className="text-[9px] text-gray-400">{p.type}</p>
              </div>
            </div>
            {/* Date */}
            <p className="text-[11px] text-gray-500 text-center">{p.date}</p>
            {/* Spend */}
            <div className="text-right">
              <p className="text-[11px] font-semibold text-red-500">{p.amount}</p>
              <p className="text-[9px] text-gray-400">{p.total}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
