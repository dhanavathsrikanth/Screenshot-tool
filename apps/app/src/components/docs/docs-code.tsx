"use client";

import { useId, useState } from "react";
import { Icon } from "@/components/icons";
import type { DocCode } from "@/lib/docs-content";
import type { DocLiveExample } from "@/lib/docs-live";
import { DocsTryButton } from "./docs-try";
import styles from "./docs.module.css";

function highlighted(code: string) {
  return code.split(/("(?:[^"\\]|\\.)*"|'[^']*'|\b(?:true|false|null|const|await|return|import|from|export|async|if|else|throw|new|def|try|except|with)\b|\b\d+\b|#[^\n]*|\/\/[^\n]*)/g).map((part, index) => {
    const className = /^['"]/.test(part) ? styles.codeString : /^(#|\/\/)/.test(part) ? styles.codeComment : /^(true|false|null|const|await|return|import|from|export|async|if|else|throw|new|def|try|except|with|\d+)$/.test(part) ? styles.codeKeyword : undefined;
    return className ? <span className={className} key={index}>{part}</span> : part;
  });
}

export function DocsCode({ samples, live = [] }: { samples: DocCode[]; live?: DocLiveExample[] }) {
  const [selected, setSelected] = useState(0);
  const [copyState, setCopyState] = useState("");
  const id = useId();
  const sample = samples[selected] ?? samples[0];
  async function copy() {
    try { await navigator.clipboard.writeText(sample.code); setCopyState("Copied"); }
    catch { setCopyState("Select the code to copy"); }
  }
  return (
    <div className={styles.codeBlock}>
      <div className={styles.codeToolbar}>
        <div className={styles.codeTabs} role="tablist" aria-label="Example language">
          {samples.map((item, index) => <button key={item.label} id={`${id}-tab-${index}`} type="button" role="tab" aria-selected={index === selected} aria-controls={`${id}-panel`} tabIndex={index === selected ? 0 : -1} onClick={() => { setSelected(index); setCopyState(""); }} onKeyDown={(event) => {
            if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") return;
            event.preventDefault();
            const next = event.key === "Home" ? 0 : event.key === "End" ? samples.length - 1 : (selected + (event.key === "ArrowRight" ? 1 : -1) + samples.length) % samples.length;
            setSelected(next); setCopyState(""); document.getElementById(`${id}-tab-${next}`)?.focus();
          }}>{item.label}</button>)}
        </div>
        {live.map((example) => <DocsTryButton key={example.operation} example={example} />)}
        <button type="button" onClick={() => void copy()} className={styles.copyButton} aria-label={`Copy ${sample.label} example`}><Icon name={copyState === "Copied" ? "check" : "copy"} /><span>{copyState || "Copy"}</span></button>
        <span className={styles.srOnly} role="status">{copyState}</span>
      </div>
      <pre id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${selected}`} tabIndex={0}><code>{highlighted(sample.code)}</code></pre>
    </div>
  );
}
