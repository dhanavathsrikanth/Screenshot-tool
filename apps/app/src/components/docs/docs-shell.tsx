"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import type { DocPage } from "@/lib/docs-content";
import styles from "./docs.module.css";

export interface DocsNavEntry { slug: string; title: string; description: string; group: string; icon: DocPage["icon"]; method?: DocPage["method"]; search: string }
const href = (slug: string) => slug ? `/docs/${slug}` : "/docs";

export function DocsShell({ navigation, current, headings, children }: {
  navigation: DocsNavEntry[];
  current: DocsNavEntry;
  headings: { id: string; title: string }[];
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<{ slug: string; id: string } | null>(null);
  const searchDialog = useRef<HTMLDialogElement>(null);
  const openSearch = () => { setQuery(""); searchDialog.current?.showModal(); };
  const closeSearch = () => searchDialog.current?.close();
  const groups = [...new Set(navigation.map((page) => page.group))];
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const results = (terms.length ? navigation.filter((page) => terms.every((term) => page.search.toLowerCase().includes(term))) : navigation.filter((page) => ["quickstart", "api/screenshot", "api/options", "api/jobs", "mcp"].includes(page.slug)))
    .sort((a, b) => Number(b.title.toLowerCase().includes(query.toLowerCase())) - Number(a.title.toLowerCase().includes(query.toLowerCase())));

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); searchDialog.current?.showModal(); }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) setActive({ slug: current.slug, id: entry.target.id });
    }, { rootMargin: "-140px 0px -55% 0px" });
    for (const heading of headings) { const target = document.getElementById(heading.id); if (target) observer.observe(target); }
    return () => observer.disconnect();
  }, [current.slug, headings]);

  return (
    <div className={styles.root}>
      <a href="#docs-content" className={styles.skip}>Skip to content</a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/docs" className={styles.logo} aria-label="Snapforge documentation"><span className={styles.logoMark}><Icon name="logo" className="size-6" /></span>snapforge<span className={styles.docsLabel}>docs</span></Link>
          <button type="button" onClick={openSearch} className={styles.searchButton}><Icon name="search" /><span>Search documentation…</span><kbd>⌘ K</kbd></button>
          <div className={styles.headerActions}><Link href="/playground">Playground<Icon name="chevron" className="size-3" /></Link><Link href="/" className={styles.consoleLink}>Open console<Icon name="chevron" className="size-3" /></Link></div>
          <button type="button" onClick={openSearch} className={styles.mobileSearch} aria-label="Search documentation"><Icon name="search" /></button>
        </div>
        <div className={styles.topNav}><div className={styles.topNavInner}>
          <button type="button" aria-expanded={menuOpen} aria-controls="docs-navigation" onClick={() => setMenuOpen(!menuOpen)} className={styles.menuButton}><Icon name={menuOpen ? "x" : "menu"} /><span>Menu</span></button>
          <Link href="/docs" aria-current={current.group !== "API reference" ? "page" : undefined}>Documentation</Link>
          <Link href="/docs/api/screenshot" aria-current={current.group === "API reference" ? "page" : undefined}>API reference</Link>
          <Link href="/docs/mcp">MCP & agents<span className={styles.smallBadge}>3 tools</span></Link>
          <a href="/llms.txt" className={styles.agentLink}><Icon name="sparkles" className="size-3.5" />llms.txt</a>
        </div></div>
      </header>
      <div className={styles.layout}>
        {menuOpen && <button className={styles.navBackdrop} aria-label="Close documentation navigation" onClick={() => setMenuOpen(false)} />}
        <aside id="docs-navigation" className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ""}`} aria-label="Documentation navigation">
          <Link href="/docs/quickstart" className={styles.quickstartLink} onClick={() => setMenuOpen(false)}><span><Icon name="bolt" />Quickstart</span><Icon name="chevron" className="size-3" /></Link>
          <nav>{groups.map((group) => <div className={styles.navGroup} key={group}><h2>{group}</h2>{navigation.filter((page) => page.group === group).map((page) => <Link key={page.slug} href={href(page.slug)} className={styles.navItem} aria-current={current.slug === page.slug ? "page" : undefined} onClick={() => setMenuOpen(false)}>{page.method ? <span className={styles.methodMini}>{page.method}</span> : <Icon name={page.icon} className="size-4" />}<span>{page.title}</span></Link>)}</div>)}</nav>
          <div className={styles.sidebarFooter}><Icon name="shield" /><span>Failed captures use no credits.</span></div>
        </aside>
        <main id="docs-content" className={styles.article} tabIndex={-1}>{children}</main>
        <aside className={styles.toc} aria-label="On this page"><p><Icon name="list" className="size-3.5" />On this page</p><nav>{headings.map((heading) => <a key={heading.id} href={`#${heading.id}`} aria-current={(active?.slug === current.slug ? active.id : headings[0]?.id) === heading.id ? "location" : undefined}>{heading.title}</a>)}</nav><div className={styles.tocHelp}><Icon name="play" /><strong>Try it in the playground</strong><p>Fine-tune your capture and get the request code.</p><Link href="/playground">Open playground<Icon name="chevron" className="size-3" /></Link></div></aside>
      </div>
      <dialog ref={searchDialog} className={styles.searchDialog} aria-labelledby="docs-search-title" onClick={(event) => { if (event.target === event.currentTarget) closeSearch(); }}>
        <div className={styles.searchInputRow}><Icon name="search" /><label id="docs-search-title" className={styles.srOnly} htmlFor="docs-search">Search documentation</label><input id="docs-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search guides, parameters, and endpoints…" autoComplete="off" onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter") {
            const first = document.getElementById("docs-search-results")?.querySelector("a");
            if (first) { event.preventDefault(); if (event.key === "Enter") first.click(); else first.focus(); }
          }
        }} /><button type="button" onClick={closeSearch} aria-label="Close search"><kbd>Esc</kbd></button></div>
        <div id="docs-search-results" className={styles.searchResults} onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          const links = Array.from(event.currentTarget.querySelectorAll("a"));
          const index = links.indexOf(document.activeElement as HTMLAnchorElement);
          if (index < 0) return;
          event.preventDefault();
          if (event.key === "ArrowUp" && index === 0) document.getElementById("docs-search")?.focus();
          else links[Math.min(links.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))]?.focus();
        }}><p className={styles.searchCaption}>{terms.length ? `${results.length} matching pages` : "Popular pages"}</p>{results.length ? results.map((page) => <Link key={page.slug} href={href(page.slug)} onClick={closeSearch}><Icon name={page.icon} /><span><small>{page.group}</small><strong>{page.title}</strong><span>{page.description}</span></span><Icon name="chevron" className="size-3" /></Link>) : <div className={styles.searchEmpty} role="status">No pages match “{query}”. Try a parameter such as full_page, or a topic such as webhooks.</div>}</div>
        <div className={styles.searchFooter}>Search the complete Snapforge reference<span>↑ ↓ Navigate · Enter to open · Esc to close</span></div>
      </dialog>
    </div>
  );
}
