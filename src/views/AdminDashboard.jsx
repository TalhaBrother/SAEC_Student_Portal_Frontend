import {
  HiOutlineUsers,
  HiOutlineAcademicCap,
  HiOutlineCalendarDays,
  HiOutlineBanknotes,
} from "react-icons/hi2";
import DashboardLayout from "../layouts/DashboardLayout";
import MetricCard from "../components/MetricCard";
import BarChart from "../components/charts/BarChart";
import DonutChart from "../components/charts/DonutChart";

const enrollmentByMonth = {
  labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
  datasets: [
    { label: "New enrollments", data: [120, 190, 150, 220, 180, 240] },
  ],
};

const attendanceBreakdown = {
  labels: ["Present", "Absent", "Late"],
  data: [82, 11, 7],
};

const feesBreakdown = {
  labels: ["Paid", "Pending", "Overdue"],
  data: [68, 22, 10],
  colors: ["#0056D2", "#F9BC15", "#FE4A65"],
};

export default function AdminDashboard() {
  return (
    <DashboardLayout title="Dashboard overview">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          icon={HiOutlineUsers}
          label="Total students"
          value="2,480"
          trend="+4.2%"
          accent="primary"
        />
        <MetricCard
          icon={HiOutlineAcademicCap}
          label="Active courses"
          value="86"
          trend="+1.8%"
          accent="primary"
        />
        <MetricCard
          icon={HiOutlineCalendarDays}
          label="Attendance rate"
          value="93%"
          trend="-0.5%"
          accent="tertiary"
        />
        <MetricCard
          icon={HiOutlineBanknotes}
          label="Pending fees"
          value="312"
          trend="+12%"
          accent="quaternary"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-[var(--quinary)]">
              Enrollments this year
            </h2>
            <span className="text-xs text-gray-400">Last 6 months</span>
          </div>
          <BarChart
            labels={enrollmentByMonth.labels}
            datasets={enrollmentByMonth.datasets}
          />
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-[var(--quinary)] mb-4">
            Attendance breakdown
          </h2>
          <DonutChart
            labels={attendanceBreakdown.labels}
            data={attendanceBreakdown.data}
            centerLabel="93%"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-[var(--quinary)] mb-4">
            Fees status
          </h2>
          <DonutChart
            labels={feesBreakdown.labels}
            data={feesBreakdown.data}
            colors={feesBreakdown.colors}
            height="h-56"
          />
        </div>

        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-5 shadow-sm flex items-center justify-center text-gray-400 text-sm">
          Recent activity / table goes here
        </div>
      </div>
    </DashboardLayout>
  );
}
