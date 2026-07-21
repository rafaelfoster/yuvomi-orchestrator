import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthContext";
import { IconBolt, IconClock, IconGrid, IconLogout, IconUsers } from "./icons";
import { UserSettingsModal } from "./UserSettingsModal";

export function Layout() {
  const { t } = useTranslation();
  const { admin, logout } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const navItems = [
    { to: "/", label: t("layout.overview"), icon: IconGrid, end: true },
    { to: "/tenants", label: t("layout.families"), icon: IconUsers, end: false },
    { to: "/schedules", label: t("layout.schedules"), icon: IconClock, end: false },
  ];

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-white/[0.06] bg-ink-900/70 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-5 py-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-emerald-700 text-ink-950 shadow-glow">
            <IconBolt className="h-5 w-5" />
          </div>
          <div>
            <p className="font-display text-sm font-bold tracking-tight text-white">Yuvomi</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">{t("layout.brand")}</p>
          </div>
        </div>

        <nav className="mt-2 flex-1 space-y-1 px-3" aria-label={t("layout.overview")}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-accent/10 text-accent-soft shadow-[inset_0_0_0_1px_rgba(52,211,153,0.2)]"
                    : "text-slate-400 hover:bg-white/[0.04] hover:text-white"
                }`
              }
            >
              <item.icon className="h-[18px] w-[18px] transition-transform group-hover:scale-110" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/[0.06] p-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              title={t("userSettings.title")}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-left transition-colors hover:bg-white/[0.04]"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/30 to-cyan-500/30 font-display text-xs font-bold uppercase text-white ring-1 ring-white/10">
                {admin?.email?.slice(0, 2) ?? "?"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-300">{admin?.email}</p>
                <p className="text-[10px] text-slate-600">{admin?.isSuperAdmin ? t("layout.superAdmin") : t("layout.admin")}</p>
              </div>
            </button>
            <button
              onClick={() => logout()}
              title={t("layout.signOut")}
              aria-label={t("layout.signOut")}
              className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white/5 hover:text-red-400"
            >
              <IconLogout className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="ml-60 min-w-0 flex-1 px-8 py-8">
        <div className="mx-auto max-w-7xl">
          <Outlet />
        </div>
      </main>

      <UserSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
