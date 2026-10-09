import { DocsTryProvider } from "@/components/docs/docs-try";

export default function DocumentationLayout({ children }: { children: React.ReactNode }) {
  return <DocsTryProvider>{children}</DocsTryProvider>;
}
