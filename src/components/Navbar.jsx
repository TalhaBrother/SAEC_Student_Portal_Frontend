import { HiOutlineMagnifyingGlass, HiOutlineBell, HiOutlineEnvelope, HiChevronDown } from "react-icons/hi2";
import useAuthStore from "../store/authStore";
import { useNavigate } from "react-router";
export default function Navbar({ title = "Dashboard" }) {
  const logout=useAuthStore((state)=>state.logout)
  const navigate=useNavigate()

const handleLogout=()=>{
  logout();
  navigate("/auth/login",{replace:true})
}

  return (
    <header className="w-full h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div>
        <h1 className="text-lg font-semibold text-[var(--quinary)]">{title}</h1>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden md:flex items-center gap-2 bg-[var(--secondary)] rounded-lg px-3 py-2 w-64">
          <HiOutlineMagnifyingGlass className="text-gray-400 text-base" />
          <input
            type="text"
            placeholder="Search students, courses..."
            className="bg-transparent text-sm outline-none w-full placeholder:text-gray-400"
          />
        </div>

        <button className="relative p-2 rounded-lg hover:bg-[var(--secondary)] transition-colors">
          <HiOutlineBell className="text-xl text-gray-600" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--quaternary)]" />
        </button>

        <button className="p-2 rounded-lg hover:bg-[var(--secondary)] transition-colors">
          <HiOutlineEnvelope className="text-xl text-gray-600" />
        </button>

        <button className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg hover:bg-[var(--secondary)] transition-colors">
          <div className="w-8 h-8 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-xs font-semibold">
            AK
          </div>
          <span className="hidden sm:block text-sm font-medium text-[var(--quinary)]">Admin</span>
          <HiChevronDown className="text-gray-400 text-sm" />
        </button>
      </div>
    <div className="flex justify-end">
  <button
    onClick={handleLogout}
    className="flex items-center gap-2 bg-[var(--quinary)] hover:bg-red-600 text-[var(--secondary)] font-semibold px-5 py-2.5 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 cursor-pointer active:scale-95"
  >
    Logout
  </button>
</div>
    </header>
  );
}
