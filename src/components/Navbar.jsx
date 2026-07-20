import { HiOutlineMagnifyingGlass, HiOutlineBell, HiOutlineEnvelope, HiChevronDown, HiBars3 } from "react-icons/hi2";
import useAuthStore from "../store/authStore";
import { useNavigate } from "react-router";

export default function Navbar({ title = "Dashboard", onMenuToggle }) {
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/auth/login", { replace: true });
  };

  return (
    <header className="w-full h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6 z-30">
      
      {/* Left Side: Title and Mobile Toggle */}
      <div className="flex items-center gap-3">
        {/* Mobile Hamburger Trigger Menu */}
        <button 
          onClick={onMenuToggle}
          className="p-2 -ml-2 rounded-lg text-gray-600 hover:bg-[var(--secondary)] md:hidden focus:outline-none cursor-pointer"
          aria-label="Open sidebar menu"
        >
          <HiBars3 className="text-2xl" />
        </button>
        
        <h1 className="text-base sm:text-lg font-semibold text-[var(--quinary)] truncate max-w-[150px] sm:max-w-none">
          {title}
        </h1>
      </div>

      {/* Right Side: Search & Global Portal Utilities */}
      <div className="flex items-center gap-2 sm:gap-4">
        
        {/* Search Bar - Maintained hidden state on mobile */}
        <div className="hidden md:flex items-center gap-2 bg-[var(--secondary)] rounded-lg px-3 py-2 w-64">
          <HiOutlineMagnifyingGlass className="text-gray-400 text-base" />
          <input
            type="text"
            placeholder="Search students, courses..."
            className="bg-transparent text-sm outline-none w-full placeholder:text-gray-400"
          />
        </div>

        {/* System Notifications Action */}
        <button className="relative p-2 rounded-lg hover:bg-[var(--secondary)] transition-colors cursor-pointer">
          <HiOutlineBell className="text-lg sm:text-xl text-gray-600" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--quaternary)]" />
        </button>

        {/* Messaging Interface Trigger - Hidden on very small screens to maintain layout balance */}
        <button className="hidden xs:block p-2 rounded-lg hover:bg-[var(--secondary)] transition-colors cursor-pointer">
          <HiOutlineEnvelope className="text-lg sm:text-xl text-gray-600" />
        </button>

        {/* User Workspace Profile Overview */}
        <div className="flex items-center gap-2 sm:gap-4">
          <button className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg hover:bg-[var(--secondary)] transition-colors cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-xs font-semibold shrink-0">
              AK
            </div>
            <span className="hidden lg:block text-sm font-medium text-[var(--quinary)]">Admin</span>
            <HiChevronDown className="hidden sm:block text-gray-400 text-sm" />
          </button>

          {/* Cleaned Logout Action Button */}
          <button
            onClick={handleLogout}
            className="bg-[var(--quinary)] hover:bg-red-600 text-[var(--secondary)] font-semibold text-xs sm:text-sm px-3 sm:px-5 py-2 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer active:scale-95 shrink-0"
          >
            Logout
          </button>
        </div>

      </div>
    </header>
  );
}