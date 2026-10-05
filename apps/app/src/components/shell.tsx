"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { NAV_GROUPS } from "@/lib/nav";
import type { EngineHealthPayload } from "@/lib/capture";
import { Icon } from "./icons";
import { Sidebar } from "./sidebar";
import { Input } from "./ui";
import styles from "./workspace.module.css";

let fallbackCollapsed = false;
let storageUnavailable = false;
function subscribeSidebar(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("sf-sidebar-change", onChange);
  return () => { window.removeEventListener("storage", onChange); window.removeEventListener("sf-sidebar-change", onChange); };
}
function sidebarSnapshot() {
  if (storageUnavailable) return fallbackCollapsed;
  try { return window.localStorage.getItem("sf.sidebar.collapsed") === "1"; } catch { return fallbackCollapsed; }
}
function toggleSidebar() {
  fallbackCollapsed = !sidebarSnapshot();
  try { window.localStorage.setItem("sf.sidebar.collapsed", fallbackCollapsed ? "1" : "0"); } catch { storageUnavailable = true; }
  window.dispatchEvent(new Event("sf-sidebar-change"));
}
const serverSnapshot = () => false;
const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const collapsed = useSyncExternalStore(subscribeSidebar, sidebarSnapshot, serverSnapshot);
  const [overlay, setOverlay] = useState<{ pathname: string; kind: "navigation" | "search" } | null>(null);
  const openOverlay = overlay?.pathname === pathname ? overlay.kind : null;
  const [query, setQuery] = useState("");
  const [health, setHealth] = useState<EngineHealthPayload | null>(null);
  const [checkedHealth, setCheckedHealth] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const openSearch = () => { setQuery(""); setOverlay({ pathname, kind: "search" }); };

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        if (!response.ok) throw new Error("Service unavailable");
        const payload = await response.json() as EngineHealthPayload;
        if (active) setHealth(payload);
      } catch { if (active) setHealth(null); }
      finally {
        if (active) { setCheckedHealth(true); timer = setTimeout(poll, 10_000); }
      }
    };
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === "k") { event.preventDefault(); setQuery(""); setOverlay({ pathname, kind: "search" }); }
      if (event.key.toLowerCase() === "b" && !(event.target instanceof HTMLElement && event.target.closest("input, textarea, [contenteditable=true]"))) { event.preventDefault(); toggleSidebar(); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [pathname]);

  useEffect(() => {
    if (!openOverlay || !dialog.current) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = dialog.current;
    const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), [tabindex="0"]'));
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const background = document.getElementById("sf-workspace");
    if (background) background.inert = true;
    (panel.querySelector<HTMLElement>("input") ?? focusable()[0] ?? panel).focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOverlay(null); }
      if (event.key === "Tab") {
        const items = focusable();
        const first = items[0]; const last = items.at(-1);
        if (!items.length) { event.preventDefault(); panel.focus(); }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); document.body.style.overflow = overflow; if (background) background.inert = false; if (previous?.isConnected) previous.focus(); };
  }, [openOverlay]);

  const title = NAV_ITEMS.find((item) => item.href === "/" ? pathname === "/" : pathname.startsWith(item.href))?.label ?? "Workspace";
  const results = NAV_ITEMS.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <>
      <div id="sf-workspace" className={styles.shell}>
        <a href="#workspace-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded-md focus:bg-surface focus:p-3">Skip to content</a>
        <aside id="desktop-navigation" className={`${styles.desktop} ${collapsed ? styles.collapsed : ""}`}><Sidebar collapsed={collapsed} /></aside>
        <div className={styles.workspace}>
          <header className={styles.topbar}>
            <button type="button" className={`${styles.iconButton} ${styles.mobileToggle}`} aria-label="Open navigation" aria-expanded={openOverlay === "navigation"} aria-controls="mobile-navigation" onClick={() => setOverlay({ pathname, kind: "navigation" })}><Icon name="menu" /></button>
            <button type="button" className={`${styles.iconButton} ${styles.desktopToggle}`} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} aria-controls="desktop-navigation" onClick={toggleSidebar}><Icon name="panel" /></button>
            <div className={styles.breadcrumb}><span>Workspace</span><Icon name="chevron" className="size-3 text-ink-3" /><strong>{title}</strong></div>
            <div className={styles.topActions}>
              <button type="button" className={styles.searchButton} onClick={openSearch} aria-label="Search navigation"><Icon name="search" /><span>Search</span><kbd>⌘ / Ctrl K</kbd></button>
              <span className={styles.status} role="status"><span className={`${styles.statusDot} ${health?.ok ? styles.available : checkedHealth ? styles.unavailable : ""}`} />{!checkedHealth ? "Checking service" : health?.ok ? "Service ready" : "Service unavailable"}</span>
              <UserButton />
            </div>
          </header>
          <main id="workspace-content" tabIndex={-1} className={styles.main}><div className={styles.content}>{children}</div></main>
        </div>
      </div>
      {openOverlay && <div className={styles.overlay}>
        <button type="button" className={styles.backdrop} onClick={() => setOverlay(null)} aria-label={openOverlay === "search" ? "Close search" : "Dismiss navigation"} tabIndex={-1} />
        <div ref={dialog} id={openOverlay === "navigation" ? "mobile-navigation" : "navigation-search"} role="dialog" aria-modal="true" aria-label={openOverlay === "search" ? "Search navigation" : "Navigation"} tabIndex={-1} className={openOverlay === "navigation" ? styles.drawer : styles.searchDialog}>
          {openOverlay === "navigation" ? <Sidebar collapsed={false} onNavigate={() => setOverlay(null)} onClose={() => setOverlay(null)} /> : <>
            <div className={styles.searchHeading}><h2>Go to a page</h2><button type="button" className={styles.iconButton} onClick={() => setOverlay(null)} aria-label="Close search"><Icon name="x" /></button></div>
            <Input aria-label="Search pages" value={query} placeholder="Search your workspace…" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && results[0]) { event.preventDefault(); router.push(results[0].href); setOverlay(null); } }} />
            <div className={styles.searchResults}>{results.map((item) => <Link href={item.href} key={item.href} className={styles.navLink} onClick={() => setOverlay(null)}><Icon name={item.icon} /><span>{item.label}</span><Icon name="chevron" className="ml-auto size-3" /></Link>)}{!results.length && <p className="p-4 text-sm text-ink-3">No pages match “{query}”.</p>}</div>
          </>}
        </div>
      </div>}
    </>
  );
}
