import { appIcon } from "@/lib/brand/art";

/**
 * The web manifest's icons, for Android's Add to Home Screen. Two sizes, both
 * prerendered; any other size is a 404 rather than a render on request.
 */
const SIZES = ["192", "512"] as const;

export const dynamicParams = false;

export function generateStaticParams() {
  return SIZES.map((size) => ({ size }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  return appIcon(Number(size));
}
