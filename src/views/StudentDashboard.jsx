import {
  HiOutlineBookOpen,
  HiOutlineCalendarDays,
  HiOutlineStar,
  HiOutlineClock,
} from "react-icons/hi2";
import DashboardLayout from "../layouts/DashboardLayout";
import MetricCard from "../components/MetricCard";
import DonutChart from "../components/charts/DonutChart";
import useAuthStore from "../store/authStore";

const attendance = {
  labels: ["Present", "Absent", "Late"],
  data: [88, 8, 4],
};

const gradeDistribution = {
  labels: ["A", "B", "C", "Below C"],
  data: [4, 3, 2, 1],
  colors: ["#0056D2", "#F9BC15", "#FE4A65", "#1A253C"],
};


export default function StudentDashboard() {
  const user=useAuthStore((state)=>state.user)
console.log("Zustand User",user)
  return (
    <DashboardLayout title="My dashboard">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          icon={HiOutlineBookOpen}
          label="Enrolled courses"
          value="6"
          accent="primary"
        />
        <MetricCard
          icon={HiOutlineCalendarDays}
          label="Attendance"
          value="88%"
          trend="+2.1%"
          accent="tertiary"
        />
        <MetricCard
          icon={HiOutlineStar}
          label="Average grade"
          value="B+"
          accent="primary"
        />
        <MetricCard
          icon={HiOutlineClock}
          label="Pending assignments"
          value="3"
          trend="-1"
          accent="quaternary"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-[var(--quinary)] mb-4">
            My attendance
          </h2>
          <DonutChart
            labels={attendance.labels}
            data={attendance.data}
            centerLabel="88%"
          />
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-[var(--quinary)] mb-4">
            Grades by course
          </h2>
          <DonutChart
            labels={gradeDistribution.labels}
            data={gradeDistribution.data}
            colors={gradeDistribution.colors}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
