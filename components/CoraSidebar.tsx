"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { CoraNewChatButton } from "@/components/CoraNewChatButton";
import { UserProfile } from "@/components/user-profile";
import styles from "@/components/cora-sidebar.module.css";

export function CoraSidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const syncSidebarWidth = useCallback((collapsed: boolean) => {
    const w = collapsed ? 70 : 250;
    document.documentElement.style.setProperty("--sidebar-width", `${w}px`);
  }, []);

  useEffect(() => {
    syncSidebarWidth(isCollapsed);
  }, [isCollapsed, syncSidebarWidth]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 968px)");
    const onChange = () => {
      if (mq.matches) {
        setIsCollapsed(true);
        syncSidebarWidth(true);
      }
    };
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [syncSidebarWidth]);

  const handleNewChat = () => {
    setIsMobileMenuOpen(false);
    window.dispatchEvent(new CustomEvent("newChatStarted"));
  };

  const toggleSidebar = () => {
    setIsCollapsed((c) => !c);
  };

  const menuIcon = isMobileMenuOpen ? "\u2715" : "\u2630";

  return (
    <>
      <button
        type="button"
        className={`${styles.mobileMenuButton} ${isMobileMenuOpen ? styles.mobileMenuButtonOpen : ""}`}
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        aria-label={isMobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
      >
        {menuIcon}
      </button>

      {isMobileMenuOpen && (
        <div
          className={styles.mobileOverlay}
          role="presentation"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <div
        className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ""} ${isMobileMenuOpen ? styles.mobileOpen : ""}`}
      >
        <div className={styles.logoContainer}>
          <Image
            className={styles.logoCora}
            src={isCollapsed ? "/logo-cora.png" : "/log-cora.png"}
            alt="Logo CORA"
            width={isCollapsed ? 50 : 150}
            height={isCollapsed ? 50 : 45}
            priority
          />
        </div>

        {!isCollapsed && <CoraNewChatButton onClick={handleNewChat} />}

        {isCollapsed && (
          <button
            type="button"
            className={styles.newChatIconButton}
            title="Nuevo Chat"
            onClick={handleNewChat}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        )}

        <div className={styles.conversationListWrapper} aria-hidden />

        <div className={styles.sidebarFooter}>
          <UserProfile isCollapsed={isCollapsed} />
          <button
            type="button"
            className={styles.toggleButton}
            onClick={toggleSidebar}
            title={isCollapsed ? "Expandir sidebar" : "Colapsar sidebar"}
          >
            {isCollapsed ? (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            ) : (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
