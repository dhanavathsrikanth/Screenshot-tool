import Link from "next/link";
import { Icon } from "@/components/icons";
import { DOC_FIELDS, DOC_PAGES, docHref, type DocPage } from "@/lib/docs-content";
import { DocsCode } from "./docs-code";
import { DocsTryButton } from "./docs-try";
import { docLiveExamples } from "@/lib/docs-live";
import styles from "./docs.module.css";

function inline(text: string) {
  return text.split(/(`[^`]+`|\[[^\]]+\]\([^)]+\))/g).map((part, index) => {
    if (part.startsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    const match = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    return match ? <Link key={index} href={match[2]}>{match[1]}</Link> : part;
  });
}

export function DocsArticle({ page }: { page: DocPage }) {
  const index = DOC_PAGES.indexOf(page);
  const previous = DOC_PAGES[index - 1];
  const next = DOC_PAGES[index + 1];
  return <>
    <div className={styles.breadcrumb}><span>{page.group}</span><Icon name="chevron" className="size-3" /><span>{page.title}</span></div>
    <div className={styles.articleTop}><span className={styles.eyebrow}>{page.group}</span><a href={`/docs/markdown/${page.slug}`} className={styles.markdownLink}><Icon name="copy" className="size-3.5" />View as Markdown</a></div>
    <h1>{page.slug === "" ? "Capture the web.\nBuild what’s next." : page.title}</h1>
    <p className={styles.description}>{page.description}</p>
    {page.slug === "api/options" && <div className={styles.optionsTry}><span>Edit any of the parameters below in a live request.</span><DocsTryButton example={{ operation: "capture", title: "Try capture options", body: { url: "https://example.com", format: "png", viewport: { width: 1280, height: 720 } } }} /></div>}
    {page.endpoint && <div className={styles.endpoint}><span className={styles.method}>{page.method}</span><code>{page.endpoint}</code><span>REST API</span><DocsTryButton example={{ operation: page.slug === "api/jobs" ? "job" : page.slug === "api/retries" ? "request" : page.slug === "api/health" ? "health" : "capture", title: page.title, ...(page.slug === "api/screenshot" ? { body: { url: "https://example.com", format: "png" } } : {}) }} /></div>}
    {page.slug === "" && <div className={styles.captureDemo} aria-label="A URL becomes a downloadable screenshot"><div className={styles.demoRequest}><span><Icon name="bolt" />CAPTURE REQUEST</span><code><b>POST</b> /v1/screenshot</code><code>{'{ "url": "https://example.com" }'}</code><p>One URL. A real browser. Your output.</p></div><div className={styles.demoArrow}><Icon name="chevron" /></div><div className={styles.demoResult}><div><span><i /><i /><i /></span><small>example.com</small><Icon name="shield" className="size-3" /></div><section><strong>Example Domain</strong><p>This domain is for use in illustrative examples in documents.</p><span>Learn more<Icon name="chevron" className="size-3" /></span></section><footer><span><Icon name="check" className="size-3" />Capture ready</span><code>PNG · 1280 × 720</code></footer></div></div>}
    <div className={styles.prose}>
      {page.sections.map((section) => <section id={section.id} key={section.id} className={styles.section}>
        <h2><a href={`#${section.id}`} aria-label={`Link to ${section.title}`}>{section.title}<span>#</span></a></h2>
        {section.paragraphs?.map((text) => <p key={text}>{inline(text)}</p>)}
        {section.note && <aside className={`${styles.callout} ${section.note.caution ? styles.caution : ""}`}><Icon name={section.note.caution ? "alert" : "shield"} /><div><strong>{section.note.title}</strong><p>{inline(section.note.text)}</p></div></aside>}
        {section.bullets && <ul>{section.bullets.map((item) => <li key={item}>{inline(item)}</li>)}</ul>}
        {section.cards && <div className={styles.cards}>{section.cards.map((card) => <Link key={card.href} href={card.href} className={styles.docCard}><Icon name={card.icon} className="size-5" /><strong>{card.title}<Icon name="chevron" className="size-3.5" /></strong><p>{card.description}</p></Link>)}</div>}
        {section.table && <div className={styles.tableWrap} tabIndex={0} role="region" aria-label={`${section.title} table`}><table><thead><tr>{section.table.headers.map((header) => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{section.table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, column) => <td key={column}>{inline(cell)}</td>)}</tr>)}</tbody></table></div>}
        {section.fields && <div className={styles.fields}>{DOC_FIELDS.map((field) => <div className={styles.field} id={`option-${field.name}`} key={field.name}><div><code>{field.name}</code><span>{field.type}</span><small>{field.default === "Required" || field.default === "Optional" ? field.default : `Default: ${field.default}`}</small></div><p>{field.description}</p></div>)}</div>}
        {section.code && <DocsCode samples={section.code} live={docLiveExamples(page, section)} />}
      </section>)}
    </div>
    <div className={styles.pageFooter}><span>Snapforge documentation</span><a href={`/docs/markdown/${page.slug}`}><Icon name="download" className="size-3.5" />Markdown source</a></div>
    <nav className={styles.pagination} aria-label="Documentation pages">{previous ? <Link href={docHref(previous.slug)}><small>Previous</small><strong>{previous.title}</strong><Icon name="chevron" className="size-4" /></Link> : <span />}{next && <Link href={docHref(next.slug)}><small>Next</small><strong>{next.title}</strong><Icon name="chevron" className="size-4" /></Link>}</nav>
  </>;
}
