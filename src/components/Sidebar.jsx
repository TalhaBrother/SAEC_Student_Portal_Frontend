import { useState } from "react";
import {
  HiOutlineSquares2X2,
  HiOutlineUsers,
  HiOutlineAcademicCap,
  HiOutlineCalendarDays,
  HiOutlineBanknotes,
  HiOutlineCog6Tooth,
  HiOutlineBuildingLibrary,
} from "react-icons/hi2";

const NAV_ITEMS = [
  { label: "Dashboard", icon: HiOutlineSquares2X2 },
  { label: "Students", icon: HiOutlineUsers },
  { label: "Courses", icon: HiOutlineAcademicCap },
  { label: "Attendance", icon: HiOutlineCalendarDays },
  { label: "Fees", icon: HiOutlineBanknotes },
  { label: "Settings", icon: HiOutlineCog6Tooth },
];

export default function Sidebar() {
  const [active, setActive] = useState("Dashboard");

  return (
    <aside className="w-full h-full bg-[var(--quinary)] text-white flex flex-col">
      <div className="flex items-center gap-2 px-6 h-16 border-b border-white/10">
        <HiOutlineBuildingLibrary className="text-[var(--tertiary)] text-2xl" />
        <span className="font-semibold text-lg tracking-tight">Student Portal</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ label, icon: Icon }) => {
          const isActive = active === label;
          return (
            <button
              key={label}
              onClick={() => setActive(label)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors
                ${isActive
                  ? "bg-[var(--primary)] text-white font-medium"
                  : "text-gray-300 hover:bg-white/5 hover:text-white"
                }`}
            >
              <Icon className="text-lg shrink-0" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5">
          <div className="w-8 h-8 rounded-full bg-[var(--tertiary)] flex items-center justify-center text-[var(--quinary)] text-xs font-semibold">
            AK
          </div>
          <div className="leading-tight">
            <p className="text-sm font-medium">Admin</p>
            <p className="text-xs text-gray-400">admin@school.edu</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
