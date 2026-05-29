"use client";

import styles from "./new-chat-button.module.css";

type Props = {
  onClick?: () => void;
};

export function CoraNewChatButton({ onClick }: Props) {
  return (
    <button
      type="button"
      className={styles.newChatButton}
      onClick={() => onClick?.()}
    >
      <span className={styles.icon}>+</span>
      <span className={styles.text}>Nuevo Chat</span>
    </button>
  );
}
