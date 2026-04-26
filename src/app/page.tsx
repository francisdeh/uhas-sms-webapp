import DashboardLayout from "@/components/dashboard/DashboardLayout";
import StatsRow from "@/components/dashboard/StatsRow";
import TopServices from "@/components/dashboard/TopServices";
import ConversionRate from "@/components/dashboard/ConversionRate";
import Performance from "@/components/dashboard/Performance";
import EarningReport from "@/components/dashboard/EarningReport";
import PaymentHistory from "@/components/dashboard/PaymentHistory";
import CoursesTable from "@/components/dashboard/CoursesTable";

export default function DashboardPage() {
  return (
    <DashboardLayout>
      <StatsRow />

      <div className="flex gap-4 mb-5">
        <TopServices />
        <ConversionRate />
      </div>

      <div className="flex gap-4 mb-5">
        <Performance />
        <EarningReport />
        <PaymentHistory />
      </div>

      <CoursesTable />

      <footer className="flex items-center justify-between text-[10px] text-gray-400 py-2">
        <span>©2025 <span className="font-semibold text-gray-600">Shadon/studio.</span> Made for better web design</span>
        <div className="flex items-center gap-4">
          <span className="hover:text-gray-600 cursor-pointer">License</span>
          <span className="hover:text-gray-600 cursor-pointer">More themes</span>
          <span className="hover:text-gray-600 cursor-pointer">Documentation</span>
          <span className="hover:text-gray-600 cursor-pointer">Support</span>
        </div>
      </footer>
    </DashboardLayout>
  );
}
