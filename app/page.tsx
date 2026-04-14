'use client'

import dynamic from "next/dynamic";
import styles from "./page.module.css";

const BusMap = dynamic(() => import("@/components/BusMap"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#718096",
      }}
    >
      Cargando mapa...
    </div>
  ),
});

export default function Home() {
  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.headerTitle}>
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="1" y="3" width="15" height="13" rx="2" />
              <path d="M16 8h4l3 3v5h-7V8z" />
              <circle cx="5.5" cy="18.5" r="2.5" />
              <circle cx="18.5" cy="18.5" r="2.5" />
            </svg>
            <div>
              <h1>Rutas de Bus</h1>
              <p>León, Guanajuato</p>
            </div>
          </div>
        </div>
      </header>
      <main className={styles.main}>
        <BusMap />
      </main>
    </>
  );
}
