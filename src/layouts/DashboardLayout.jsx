import React, { useState } from "react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import { Outlet } from "react-router";

export default function DashboardLayout({ title }) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <div className="flex w-screen h-screen bg-[var(--secondary)] overflow-hidden relative text-[var(--quinary)] font-sans antialiased">
      
      {/* 1. Desktop Sidebar (Hidden on Mobile, block layout on MD screens and above) */}
      <div className="hidden md:block md:w-64 lg:w-72 h-full shrink-0 border-r border-gray-200 bg-white">
        <Sidebar />
      </div>

      {/* 2. Mobile Sidebar Drawer Overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden transition-opacity duration-300"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* 3. Mobile Sidebar Drawer Canvas */}
      <div className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-white transition-transform duration-300 transform md:hidden ${
        isMobileOpen ? "translate-x-0" : "-translate-x-full"
      }`}>
        {/* Pass close handler if your Sidebar component wants to close the menu on link clicks */}
        <Sidebar closeMobileMenu={() => setIsMobileOpen(false)} />
      </div>

      {/* 4. Main Content Area */}
      <div className="flex-1 h-full flex flex-col min-w-0">
        {/* Updated Navbar props to include control over opening the mobile menu */}
        <Navbar 
          title={title} 
          onMenuToggle={() => setIsMobileOpen(true)} 
        />
        
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 bg-gray-50/50">
          <Outlet />
        </main>
      </div>

    </div>
  );
}