import type { Metadata } from "next";
import BounceClient from "./SideQuestClient";

export const metadata: Metadata = {
  title: "Bounce — turn waiting time into shared momentum",
  description:
    "A live social game for events: one screen, every phone, and 90 seconds to turn strangers into a crew.",
};

export default function Home() {
  return <BounceClient />;
}
