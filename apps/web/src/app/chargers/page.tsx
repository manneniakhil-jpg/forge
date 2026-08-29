"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChargersView } from "@/components/chargers-view";
import { getAuthToken } from "@/lib/utils";

export default function ChargersPage() {
  const router = useRouter();

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/auth");
    }
  }, [router]);

  return <ChargersView />;
}
