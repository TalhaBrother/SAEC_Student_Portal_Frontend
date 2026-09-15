import { useState } from "react";
import useAuthStore from "../store/authStore";
import { NavLink } from "react-router";
import {
  HiOutlineSquares2X2,
  HiOutlineUsers,
  HiOutlineAcademicCap,
  HiOutlineCalendarDays,
  HiOutlineBanknotes,
  HiOutlineBuildingLibrary,
  HiOutlineDocumentText,
  HiOutlinePencil,
  HiOutlineBookOpen,
  HiOutlineCloudArrowUp,
  HiOutlineTableCells,
  HiOutlineServer,
  HiChevronDown,
} from "react-icons/hi2";

export default function Sidebar({ closeMobileMenu }) {
  const user = useAuthStore((state) => state.user);
  const role = user?.role;

  // Track expanded groups (Empty object means all are closed by default)
  const [openGroups, setOpenGroups] = useState({});

  // Grouped Navigation Items Schema
  const NAV_GROUPS = [
    {
      title: "Main",
      items: [
        {
          label: "Dashboard",
          icon: HiOutlineSquares2X2,
          roles: ["student", "admin"],
          path: role === "admin" ? "/admin" : "/",
        },
      ],
    },
    {
      title: "Academics",
      items: [
        {
          label: "Classes",
          icon: HiOutlineCloudArrowUp,
          roles: ["admin"],
          path: "/admin/classes",
        },
        {
          label: "Students",
          icon: HiOutlineUsers,
          roles: ["admin"],
          path: "/admin/students",
        },
        {
          label: "Subjects",
          icon: HiOutlineBookOpen,
          roles: ["admin"],
          path: "/admin/subjects",
        },
      ],
    },
    {
      title: "Examinations",
      items: [
        {
          label: "Tests",
          icon: HiOutlineDocumentText,
          roles: ["student", "admin"],
          path: "/admin/tests",
        },
        {
          label: "Marks",
          icon: HiOutlinePencil,
          roles: ["student", "admin"],
          path: "/admin/marks",
        },
        {
          label: "Results",
          icon: HiOutlineAcademicCap,
          roles: ["student", "admin"],
          path: "/admin/result",
        },
        {
          label: "Timetable",
          icon: HiOutlineTableCells,
          roles: ["admin"],
          path: "/admin/examination",
        },
      ],
    },
    {
      title: "Management",
      items: [
        {
          label: "Attendance",
          icon: HiOutlineCalendarDays,
          roles: ["admin"],
          path: "/admin/attendance",
        },
        {
          label: "Fees",
          icon: HiOutlineBanknotes,
          roles: ["admin"],
          path: "/admin/fees",
        },
      ],
    },
    {
      title: "System",
      items: [
        {
          label: "Settings",
          icon: HiOutlineServer,
          roles: ["admin"],
          path: "/admin/settings",
        },
      ],
    },
  ];

  const toggleGroup = (title) => {
    setOpenGroups((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  const handleNavClick = () => {
    if (closeMobileMenu) {
      closeMobileMenu();
    }
  };

  return (
    <aside className="w-full h-full bg-[var(--quinary)] text-white flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-2 px-6 h-16 border-b border-white/10 shrink-0">
        <HiOutlineBuildingLibrary className="text-[var(--tertiary)] text-2xl" />
        <span className="font-semibold text-lg tracking-tight">Student Portal</span>
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 px-3 py-4 space-y-4">
        {NAV_GROUPS.map((group) => {
          // Filter items based on user role
          const allowedItems = group.items.filter((item) => item.roles.includes(role));
          if (allowedItems.length === 0) return null;

          // Default state is now false (closed)
          const isGroupOpen = !!openGroups[group.title];

          return (
            <div key={group.title} className="space-y-1">
              {/* Group Header / Toggle Button */}
              <button
                onClick={() => toggleGroup(group.title)}
                className="w-full flex items-center justify-between px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-white transition-colors"
              >
                <span>{group.title}</span>
                <HiChevronDown
                  className={`transition-transform duration-200 ${
                    isGroupOpen ? "rotate-0" : "-rotate-90"
                  }`}
                />
              </button>

              {/* Group Items */}
              {isGroupOpen && (
                <div className="space-y-1 pt-1">
                  {allowedItems.map(({ label, icon: Icon, path }) => (
                    <NavLink
                      key={label}
                      to={path}
                      end={path === "/" || path === "/admin"}
                      onClick={handleNavClick}
                      className={({ isActive }) =>
                        `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                          isActive
                            ? "bg-[var(--primary)] text-white font-medium"
                            : "text-gray-300 hover:bg-white/5 hover:text-white"
                        }`
                      }
                    >
                      <Icon className="text-lg shrink-0" />
                      <span>{label}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer Profile Section */}
      <div className="px-3 py-4 border-t border-white/10 shrink-0">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/5">
          <div className="w-8 h-8 rounded-full bg-[var(--tertiary)] flex items-center justify-center text-[var(--quinary)] text-xs font-semibold">
            {user?.name ? user.name.slice(0, 2).toUpperCase() : "AK"}
          </div>
          <div className="leading-tight overflow-hidden">
            <p className="text-sm font-medium truncate">{user?.name || "Admin"}</p>
            <p className="text-xs text-gray-400 truncate">{user?.email || "admin@school.edu"}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}