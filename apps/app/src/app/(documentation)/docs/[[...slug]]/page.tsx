import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DOC_PAGES, docMarkdown, getDoc } from "@/lib/docs-content";
import { DocsShell } from "@/components/docs/docs-shell";
import { DocsArticle } from "@/components/docs/docs-article";

type Props = { params: Promise<{ slug?: string[] }> };
const navigation = DOC_PAGES.map((page) => ({ slug: page.slug, title: page.title, description: page.description, group: page.group, icon: page.icon, method: page.method, search: docMarkdown(page) }));

export function generateStaticParams() {
  return DOC_PAGES.map((page) => ({ slug: page.slug ? page.slug.split("/") : [] }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = getDoc((await params).slug?.join("/") ?? "");
  return { title: `${page?.title ?? "Page not found"} · Snapforge Docs`, description: page?.description };
}

export default async function DocumentationPage({ params }: Props) {
  const page = getDoc((await params).slug?.join("/") ?? "");
  if (!page) notFound();
  const current = navigation.find((entry) => entry.slug === page.slug)!;
  return <DocsShell navigation={navigation} current={current} headings={page.sections.map((section) => ({ id: section.id, title: section.title }))}><DocsArticle page={page} /></DocsShell>;
}
