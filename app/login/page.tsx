"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./page.module.css";
import {
  getLoginBrandKey,
  LOGIN_BRAND_LABEL,
  LOGIN_HERO_LOGO,
} from "./login-brand";

type SessionPayload = {
  authenticated?: boolean;
  userPlaceholder?: string;
};

export default function LoginPage() {
  const router = useRouter();
  const brandKey = getLoginBrandKey();
  const brandNombre = LOGIN_BRAND_LABEL[brandKey];
  const heroLogo = LOGIN_HERO_LOGO[brandKey];

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [userPlaceholder, setUserPlaceholder] = useState("usuario");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data: SessionPayload) => {
        if (!cancelled) {
          if (data.userPlaceholder) {
            setUserPlaceholder(data.userPlaceholder);
          }
          if (data.authenticated) {
            router.replace("/");
          }
        }
      })
      .finally(() => {
        if (!cancelled) setCheckingSession(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "No se pudo iniciar sesión.");
        return;
      }
      router.replace("/");
    } catch {
      setError("Error de red. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return null;
  }

  return (
    <main className={styles.main}>
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <Image
            src={heroLogo.src}
            alt={heroLogo.alt}
            width={100}
            height={30}
            className={styles.heroLogo}
            priority
          />
          <div className={styles.heroTitleWrapper}>
            <h1 className={styles.heroTitle}>Inteligencia que</h1>
            <h1 className={styles.heroTitle}>impulsa a tu equipo</h1>
          </div>
          <div className={styles.heroSubtitleWrapper}>
            <p className={styles.heroSubtitle}>
              Conecta con el asistente de {brandNombre} para colaborar,
            </p>
            <p className={styles.heroSubtitle}>
              explorar soluciones y acelerar decisiones estratégicas.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.formPanel}>
        <div className={styles.card}>
          <header className={styles.header}>
            <div className={styles.logo} aria-hidden />
            <h2 className={styles.title}>Inicio de sesión</h2>
            <p className={styles.subtitle}>
              Ingresa tus credenciales para continuar con tu asistente inteligente.
            </p>
          </header>

          <form className={styles.form} onSubmit={handleSubmit}>
            <label className={styles.label} htmlFor="username">
              Usuario
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={styles.input}
              placeholder={userPlaceholder}
              required
              disabled={loading}
            />

            <label className={styles.label} htmlFor="password">
              Contraseña
            </label>
            <div className={styles.passwordWrapper}>
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${styles.input} ${styles.passwordInput}`}
                placeholder="Contraseña"
                required
                disabled={loading}
              />
              <button
                type="button"
                className={styles.passwordToggle}
                onClick={() => setShowPassword((p) => !p)}
                aria-label={
                  showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                }
              >
                {showPassword ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    aria-hidden
                  >
                    <path
                      d="M3.53 2.47a.75.75 0 0 0-1.06 1.06l2.064 2.064C3.1 6.53 2.027 7.88 1.34 9.07a2.89 2.89 0 0 0 0 2.86C3.05 14.98 6.26 18 12 18c2.02 0 3.73-.38 5.19-1.03l3.28 3.28a.75.75 0 0 0 1.06-1.06zm6.086 6.086 1.08 1.08a1.75 1.75 0 0 0 2.228 2.228l1.08 1.08A3.25 3.25 0 0 1 9.616 8.556zM12 6.5a3.25 3.25 0 0 1 3.24 3.63l2.89 2.89c1.26-.98 2.15-2.16 2.83-3.31a2.89 2.89 0 0 0 0-2.86C18.95 6.02 15.74 3 12 3c-1.34 0-2.55.23-3.63.63l2.2 2.2A3.26 3.26 0 0 1 12 6.5z"
                      fill="currentColor"
                    />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    aria-hidden
                  >
                    <path
                      d="M12 5C7.03 5 3.053 8.11 1.34 11.93a2.89 2.89 0 0 0 0 2.86C3.053 18.61 7.03 21.72 12 21.72s8.947-3.11 10.66-6.93a2.89 2.89 0 0 0 0-2.86C20.947 8.11 16.97 5 12 5zm0 11.25A3.75 3.75 0 1 1 15.75 12 3.75 3.75 0 0 1 12 16.25zm0-6A2.25 2.25 0 1 0 14.25 12 2.25 2.25 0 0 0 12 10.25z"
                      fill="currentColor"
                    />
                  </svg>
                )}
              </button>
            </div>

            {error ? <p className={styles.error}>{error}</p> : null}

            <button
              type="submit"
              className={styles.button}
              disabled={loading}
              aria-busy={loading}
            >
              {loading ? (
                <span className={styles.buttonLoading}>
                  <span className={styles.spinner} />
                  Verificando...
                </span>
              ) : (
                "Ingresar"
              )}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
