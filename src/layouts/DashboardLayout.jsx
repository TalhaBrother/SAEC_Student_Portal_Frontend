import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import { Outlet } from "react-router";

export default function DashboardLayout({ title, children }) {
  return (
    <div className="flex w-screen h-screen bg-[var(--secondary)] overflow-hidden">
      <div className="w-1/5 h-full shrink-0">
        <Sidebar />
      </div>

      <div className="w-4/5 h-full flex flex-col">
        <Navbar title={title} />
        <main className="flex-1 overflow-y-auto p-6"><Outlet/></main>
      </div>
    </div>
  );
}
