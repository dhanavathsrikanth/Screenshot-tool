import { docMarkdown, getDoc } from "@/lib/docs-content";

export async function GET(_request: Request, { params }: { params: Promise<{ slug?: string[] }> }) {
  const page = getDoc((await params).slug?.join("/") ?? "");
  if (!page) return new Response("Documentation page not found", { status: 404 });
  return new Response(docMarkdown(page), { headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
