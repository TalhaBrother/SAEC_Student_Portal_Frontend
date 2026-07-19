import {
  HiOutlineUsers,
  HiOutlineCalendarDays,
  HiOutlineAcademicCap,
} from "react-icons/hi2";
import MetricCard from "../components/MetricCard";
import BarChart from "../components/charts/BarChart";
import DonutChart from "../components/charts/DonutChart";
import { useState, useEffect } from "react";
import api from "../api/axios";
import useAuthStore from "../store/authStore";

export default function AdminDashboard() {
  const token = useAuthStore((state) => state.accessToken);

  const [Classes, setClasses] = useState([]);
  const [SelectedClass, setSelectedClass] = useState("");
  const [AttendanceData, setAttendanceData] = useState(null);
  const [ResultsData, setResultsData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Fetch the class list on mount, same pattern as Attendance.jsx
  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const res = await api.get("/classes/", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setClasses(res.data);
      } catch (err) {
        console.error("Failed to load classes:", err);
      }
    };

    if (token) fetchClasses();
  }, [token]);

  // Fetch analytics for the selected class whenever it changes
  useEffect(() => {
    if (!SelectedClass || !token) return;

    const fetchAnalytics = async () => {
      setLoading(true);
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const [attendanceRes, resultsRes] = await Promise.all([
          api.get(`/analytics/class/${SelectedClass}/attendance/`, { headers }),
          api.get(`/analytics/class/${SelectedClass}/results/`, { headers }),
        ]);
        // Kept in separate state objects on purpose: both endpoints return a
        // "student_summaries" field but with different shapes, so they must
        // never be spread together.
        setAttendanceData(attendanceRes.data);
        setResultsData(resultsRes.data);
      } catch (err) {
        console.error("Failed to load class analytics:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [SelectedClass, token]);

  const handleClassChange = (e) => {
    setSelectedClass(e.target.value);
    setAttendanceData(null);
    setResultsData(null);
  };

  const present =
    AttendanceData?.student_summaries.reduce((sum, s) => sum + s.present, 0) ?? 0;
  const absent =
    AttendanceData?.student_summaries.reduce((sum, s) => sum + s.absent, 0) ?? 0;

  return (
    <>
      {/* Class selector - every analytics call depends on this */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6 items-end">
        <div className="flex flex-col min-w-[200px] w-full sm:w-auto">
          <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
            Class
          </label>
          <select
            value={SelectedClass}
            onChange={handleClassChange}
            className="bg-white text-[var(--quinary)] border border-gray-300 rounded-xl p-3 outline-none focus:border-[var(--primary)] transition-colors text-sm cursor-pointer"
          >
            <option value="">Select Class</option>
            {Classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!SelectedClass ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 shadow-sm text-center text-gray-400 text-sm">
          Please choose a class from the options above to view its analytics.
        </div>
      ) : loading || !AttendanceData || !ResultsData ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 shadow-sm text-center text-gray-400 text-sm">
          Loading class analytics...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <MetricCard
              icon={HiOutlineUsers}
              label="Total students"
              value={AttendanceData.total_students}
              accent="primary"
            />
            <MetricCard
              icon={HiOutlineCalendarDays}
              label="Attendance rate"
              value={`${AttendanceData.class_average_attendance}%`}
              accent="tertiary"
            />
            <MetricCard
              icon={HiOutlineAcademicCap}
              label="Tests recorded"
              value={ResultsData.total_tests}
              accent="quaternary"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-[var(--quinary)]">
                  Class average per test
                </h2>
                <span className="text-xs text-gray-400">{AttendanceData.class}</span>
              </div>
              <BarChart
                labels={ResultsData.test_summaries.map((t) => t.test)}
                datasets={[
                  {
                    label: "Class average %",
                    data: ResultsData.test_summaries.map((t) => t.class_average),
                  },
                ]}
              />
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <h2 className="text-base font-semibold text-[var(--quinary)] mb-4">
                Attendance breakdown
              </h2>
              <DonutChart
                labels={["Present", "Absent"]}
                data={[present, absent]}
                centerLabel={`${AttendanceData.class_average_attendance}%`}
              />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm mt-4">
            <h2 className="text-base font-semibold text-[var(--quinary)] mb-4">
              Recent activity
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100">
                    <th className="py-2 pr-4 font-semibold">Student</th>
                    <th className="py-2 pr-4 font-semibold">Present</th>
                    <th className="py-2 pr-4 font-semibold">Absent</th>
                    <th className="py-2 pr-4 font-semibold">Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {AttendanceData.student_summaries.map((s) => (
                    <tr
                      key={s.student_id}
                      className="border-b border-gray-50 last:border-0"
                    >
                      <td className="py-2 pr-4 text-[var(--quinary)] font-medium">
                        {s.full_name}
                      </td>
                      <td className="py-2 pr-4 text-gray-600">{s.present}</td>
                      <td className="py-2 pr-4 text-gray-600">{s.absent}</td>
                      <td className="py-2 pr-4 text-gray-600">{s.percentage}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}