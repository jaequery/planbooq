import { NextResponse } from "next/server";

// Public, unauthenticated redirect from a stable URL to the latest signed
// .dmg in GitHub Releases. The landing-page "Download for macOS" button
// points here so the URL doesn't change between releases.
//
// Arch detection: the User-Agent string carries enough to tell Apple Silicon
// from Intel for Safari/Chrome on macOS. UA hints (`Sec-CH-UA-Arch`) are
// preferred when present.

const RELEASES_API = "https://api.github.com/repos/jaequery/planbooq/releases/latest";
const RELEASES_PAGE = "https://github.com/jaequery/planbooq/releases/latest";

type Asset = { name: string; browser_download_url: string };
type Release = { assets: Asset[] };

export const revalidate = 600;

function pickArch(req: Request): "arm64" | "x64" {
  const archHint = req.headers.get("sec-ch-ua-arch")?.replace(/"/g, "").toLowerCase();
  if (archHint === "arm" || archHint === "arm64") return "arm64";
  if (archHint === "x86" || archHint === "x64") return "x64";

  const ua = req.headers.get("user-agent") ?? "";
  // Intel Macs report "Intel Mac OS X"; Apple Silicon Safari still ships
  // that legacy token, so we default to arm64 (~95% of new Macs in 2026)
  // unless the UA explicitly looks like an older Intel-only build.
  if (/Mac OS X 10_1[0-4]/.test(ua)) return "x64";
  return "arm64";
}

export async function GET(req: Request): Promise<Response> {
  const arch = pickArch(req);

  try {
    const res = await fetch(RELEASES_API, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 600 },
    });
    if (!res.ok) {
      return NextResponse.redirect(RELEASES_PAGE, 302);
    }
    const release = (await res.json()) as Release;
    const dmg = release.assets.find(
      (a) => a.name.toLowerCase().endsWith(".dmg") && a.name.toLowerCase().includes(arch),
    );
    if (dmg) {
      return NextResponse.redirect(dmg.browser_download_url, 302);
    }
    return NextResponse.redirect(RELEASES_PAGE, 302);
  } catch {
    return NextResponse.redirect(RELEASES_PAGE, 302);
  }
}
