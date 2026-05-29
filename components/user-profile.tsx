"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./user-profile.module.css";

interface UserProfileProps {
  isCollapsed: boolean;
}

type SessionPayload = {
  authenticated?: boolean;
  username?: string;
  userInitials?: string;
};

export function UserProfile({ isCollapsed }: UserProfileProps) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [displayName, setDisplayName] = useState("Usuario");
  const [userInitials, setUserInitials] = useState("U");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data: SessionPayload) => {
        if (cancelled || !data.authenticated) return;
        if (data.username) setDisplayName(data.username);
        if (data.userInitials) setUserInitials(data.userInitials);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      localStorage.removeItem("chatMessages");
      localStorage.removeItem("chatThreadId");
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
    } catch {
      setIsLoggingOut(false);
    }
  };

  if (isCollapsed) {
    if (isLoggingOut) {
      return (
        <div className={styles.userProfileCollapsed}>
          <span className={styles.logoutSpinner} />
        </div>
      );
    }
    return (
      <div className={styles.userProfileCollapsed}>
        <div className={styles.avatar} title={displayName}>
          {userInitials}
        </div>
        <button
          type="button"
          className={styles.logoutIconButton}
          onClick={() => void handleLogout()}
          title="Cerrar sesión"
          disabled={isLoggingOut}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    );
  }

  if (isLoggingOut) {
    return (
      <div className={styles.userProfile}>
        <div className={styles.loggingOutContainer}>
          <span className={styles.logoutSpinner} />
          <span>Cerrando sesión...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.userProfile}>
      <div className={styles.userInfo}>
        <div className={styles.avatar}>{userInitials}</div>
        <div className={styles.userName}>{displayName}</div>
      </div>
      <button
        type="button"
        className={styles.logoutButton}
        onClick={() => void handleLogout()}
        title="Cerrar sesión"
        disabled={isLoggingOut}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>
    </div>
  );
}
