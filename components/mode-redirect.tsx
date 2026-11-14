"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

export default function ModeRedirect() {
  const router = useRouter();

  useEffect(() => {
    const savedMode = window.localStorage.getItem("credifi-active-mode");
    router.replace(savedMode === "merchant" ? "/merchant" : "/customer");
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F4F4F5]">
      <LoaderCircle className="animate-spin text-green-600" size={28} />
    </main>
  );
}
