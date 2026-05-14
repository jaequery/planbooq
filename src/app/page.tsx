import { Cormorant_Garamond } from "next/font/google";
import { LandingExperience } from "./(marketing)/_components/landing-experience";

const landingSerif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-landing-serif",
});

export const metadata = {
  title: "Planbooq — ship web projects without juggling Linear and Cursor",
  description:
    "Plan, harness, and ship in one flow. Built for founders, PMs, designers, and builders moving many web tickets at once—often ten in flight—with AI doing the heavy lifting.",
};

export default function Home(): React.ReactElement {
  return (
    <main
      className={`marketing ${landingSerif.variable} relative min-h-screen overflow-x-hidden bg-[var(--mk-bg)] text-[var(--mk-ink)] antialiased`}
    >
      <LandingExperience />
    </main>
  );
}
