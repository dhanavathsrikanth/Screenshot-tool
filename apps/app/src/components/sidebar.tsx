"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_GROUPS } from "@/lib/nav";
import { BrandMark } from "./brand";
import { Icon } from "./icons";
import styles from "./workspace.module.css";

export function Sidebar({ collapsed, onNavigate, onClose }: { collapsed: boolean; onNavigate?: () => void; onClose?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className={`${styles.sidebar} ${collapsed ? styles.rail : ""}`} aria-label="Primary">
      <div className={styles.brand}>
        <Link href="/" onClick={onNavigate} className={styles.brandLink} aria-label="Snapforge overview">
          <BrandMark className="size-8" />
          {!collapsed && <span><span className={styles.wordmark}>Snapforge<span className="text-accent-ink">.</span></span><span className={styles.workspaceLabel}>Your capture workspace</span></span>}
        </Link>
        {onClose && <button type="button" className={`${styles.iconButton} ml-auto`} onClick={onClose} aria-label="Close navigation"><Icon name="x" /></button>}
      </div>
      <div className={styles.navBody}>
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className={styles.navGroup}>
            {!collapsed && <p className={styles.groupLabel}>{group.label}</p>}
            <ul>{group.items.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return <li key={item.href}><Link href={item.href} onClick={onNavigate} aria-label={collapsed ? item.label : undefined} title={collapsed ? item.label : undefined} aria-current={active ? "page" : undefined} className={`${styles.navLink} ${active ? styles.active : ""}`}><Icon name={item.icon} className="size-4 shrink-0" />{!collapsed && <span>{item.label}</span>}</Link></li>;
            })}</ul>
          </div>
        ))}
      </div>
      <div className={styles.footer}>
        <Link href="/docs" onClick={onNavigate} aria-label={collapsed ? "Getting started" : undefined} title={collapsed ? "Getting started" : undefined} className={styles.navLink}><Icon name="book" />{!collapsed && <span>Getting started</span>}</Link>
        {!collapsed && <p className={styles.footerText}>A little URL. A lot of possibility.</p>}
      </div>
    </nav>
  );
}
