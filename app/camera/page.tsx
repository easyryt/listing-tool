import type { Metadata } from "next";
import BrowserCameraPhone from "@/components/BrowserCameraPhone";

export const metadata: Metadata = {
  title: "Phone camera | Listing Tool",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function CameraPage() {
  return <BrowserCameraPhone />;
}
