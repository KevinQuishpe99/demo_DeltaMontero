import { CoraAppShell } from "@/components/CoraAppShell";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.pageRoot}>
      <CoraAppShell />
    </div>
  );
}
