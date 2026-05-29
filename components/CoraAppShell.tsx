"use client";

import Image from "next/image";
import { ChatPanel } from "@/components/ChatPanel";
import { CoraSidebar } from "@/components/CoraSidebar";

export function CoraAppShell() {
  return (
    <div className="app-container">
      <CoraSidebar />
      <div className="main-content-wrapper">
        <header className="main-header">
          <Image
            className="logo-comware"
            src="/logo_comware.png"
            alt="Comware"
            width={500}
            height={125}
            priority
          />
        </header>
        <div className="main-content">
          <ChatPanel />
        </div>
      </div>
    </div>
  );
}
