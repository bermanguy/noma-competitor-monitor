"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the page every few seconds while something runs on the server, so nobody has to press refresh. */
export function AutoRefresh({ everyMs = 10_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(t);
  }, [router, everyMs]);
  return null;
}
