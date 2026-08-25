"use client";

import { usePathname, useRouter } from "next/navigation";

export default function TeacherNav() {
  const router = useRouter();
  const pathname = usePathname();

  const navItems = [
    {
      label: "Dashboard",
      path: "/teacher/dashboard",
      icon: "🏠",
    },
    {
      label: "Weekly Planner",
      path: "/teacher",
      icon: "📅",
    },
  ];

  return (
    <nav className="bg-blue-900 rounded-2xl p-2 mb-6">
      <div className="flex flex-wrap gap-2">
        {navItems.map((item) => {
          const active = pathname === item.path;

          return (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              className={`px-5 py-3 rounded-xl font-bold transition ${
                active
                  ? "bg-yellow-400 text-blue-950"
                  : "text-white hover:bg-blue-800"
              }`}
            >
              <span className="mr-2">{item.icon}</span>
              {item.label}
            </button>
          );
        })}

        <div className="hidden md:block flex-1" />

        <div className="px-4 py-3 text-yellow-300 font-bold">
          HawkTrack
        </div>
      </div>
    </nav>
  );
}