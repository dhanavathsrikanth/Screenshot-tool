"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFPageProxy } from "pdfjs-dist";
import styles from "./pdf-preview.module.css";

function PdfTile({ page, width, height, top, root }: { page: PDFPageProxy; width: number; height: number; top: number; root: HTMLElement | null }) {
  const surface = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!root || !surface.current) return;
    const observer = new IntersectionObserver((entries) => {
      setVisible(entries.some((entry) => entry.isIntersecting));
    }, { root, rootMargin: "256px 0px" });
    observer.observe(surface.current);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    const element = canvas.current;
    if (!visible || !element || width <= 0) return;
    let cancelled = false;
    setReady(false);
    setError(false);
    const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
    const ratio = Math.min(Math.max(window.devicePixelRatio || 1, 2), 2.5);
    element.width = Math.ceil(viewport.width * ratio);
    element.height = Math.ceil(height * ratio);
    element.style.width = "100%";
    element.style.height = "100%";
    element.setAttribute("role", "img");
    element.setAttribute("aria-label", `PDF page ${page.pageNumber}`);
    const rendering = page.render({ canvas: element, viewport, transform: [ratio, 0, 0, ratio, 0, -top * ratio] });
    void rendering.promise.then(() => {
      if (cancelled) return;
      setReady(true);
    }).catch(() => { if (!cancelled) setError(true); });
    return () => {
      cancelled = true;
      rendering.cancel();
      element.width = 0;
      element.height = 0;
    };
  }, [height, page, top, visible, width]);

  return <div ref={surface} className={styles.tile} style={{ height }} aria-busy={visible && !ready}>
    <canvas ref={canvas} className={visible ? styles.canvas : styles.hiddenCanvas} />
    {visible && (error ? <p className={styles.message}>This page could not load. Download the PDF to view it.</p> : !ready ? <p className={styles.message} role="status">Loading page {page.pageNumber}…</p> : null)}
  </div>;
}

function PdfPage({ page, width, root }: { page: PDFPageProxy; width: number; root: HTMLElement | null }) {
  const natural = page.getViewport({ scale: 1 });
  const scale = width / natural.width;
  const pageHeight = natural.height * scale;
  const tileHeight = Math.min(1024, pageHeight);
  const tileCount = Math.ceil(pageHeight / tileHeight);

  return <div className={styles.page} style={{ width }}>
    <div className={styles.sheet}>
      {width > 0 ? Array.from({ length: tileCount }, (_, index) => {
        const top = index * tileHeight;
        const height = Math.min(tileHeight, pageHeight - top);
        return <PdfTile key={`${width}-${index}`} page={page} width={width} height={height} top={top} root={root} />;
      }) : null}
    </div>
  </div>;
}
function PdfDocument({ src, targetWidth }: { src: string; targetWidth?: number }) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [pages, setPages] = useState<PDFPageProxy[]>([]);
  const [width, setWidth] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!root) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(1, Math.floor(entry.contentRect.width))));
    observer.observe(root);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    let cancelled = false;
    let loading: PDFDocumentLoadingTask | undefined;
    void import("pdfjs-dist").then(async (pdf) => {
      if (cancelled) return;
      pdf.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const source = src.startsWith("data:") ? { data: Uint8Array.from(atob(src.slice(src.indexOf(",") + 1)), (character) => character.charCodeAt(0)) } : { url: src };
      loading = pdf.getDocument({ ...source, useSystemFonts: true });
      const result = await loading.promise;
      const allPages = await Promise.all(Array.from({ length: result.numPages }, (_, index) => result.getPage(index + 1)));
      if (!cancelled) setPages(allPages);
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; void loading?.destroy().catch(() => undefined); };
  }, [src]);

  return <div className={styles.viewer} style={{ width: targetWidth ?? "100%", maxWidth: "100%" }}>
    <div ref={setRoot} className={styles.scroll} role="region" aria-label="Scrollable PDF preview" tabIndex={0}>
      {error ? <p className={styles.loadMessage}>Download the PDF to open it in your PDF reader.</p> : pages.length ? pages.map((page) => <PdfPage key={page.pageNumber} page={page} width={width} root={root} />) : <p className={styles.loadMessage}>Preparing every page…</p>}
    </div>
  </div>;
}

export function PdfPreview({ src, width }: { src: string; width?: number }) {
  return <PdfDocument key={src} src={src} targetWidth={width} />;
}
