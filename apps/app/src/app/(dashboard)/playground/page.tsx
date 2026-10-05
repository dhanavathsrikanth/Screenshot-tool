import { Playground } from "@/components/playground-form";
import { localCaptureEnabled } from "@/lib/capture-service";

export default function PlaygroundPage() {
  return <Playground localCapture={localCaptureEnabled()} />;
}
