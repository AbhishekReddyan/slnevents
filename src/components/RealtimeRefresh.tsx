"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Re-fetches the page whenever any of the given tables change in the database,
 * so stock, orders and alerts update on every open screen without reloading.
 */
export default function RealtimeRefresh({ tables }: { tables: string[] }) {
  const router = useRouter();
  const key = tables.join(",");

  useEffect(() => {
    const sb = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = sb.channel("rt-" + key + "-" + Math.random().toString(36).slice(2, 7));
    key.split(",").forEach((table) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => router.refresh(), 300);
      });
    });
    channel.subscribe();
    return () => {
      clearTimeout(timer);
      sb.removeChannel(channel);
    };
  }, [key, router]);

  return null;
}
