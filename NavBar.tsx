import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";

const TABS = [
  { to: "/feed", label: "Feed", icon: "📣" },
  { to: "/requests", label: "Requests", icon: "🆘" },
  { to: "/map", label: "Map", icon: "🗺️" },
  { to: "/dashboard", label: "Stats", icon: "📊" },
];

export default function NavBar() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/5 bg-surface/95 backdrop-blur px-2 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-md justify-between px-2 py-2">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `relative flex flex-1 flex-col items-center gap-1 rounded-xl2 py-2 text-xs font-medium transition-colors ${
                isActive ? "text-accent" : "text-zinc-500"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.div
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-xl2 bg-accent/10"
                    transition={{ type: "spring", duration: 0.4 }}
                  />
                )}
                <span className="relative text-lg leading-none">{tab.icon}</span>
                <span className="relative">{tab.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
