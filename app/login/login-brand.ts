/**
 * Marca del login (hero y textos). Igual que CORA; NEXT_PUBLIC_APP_BRAND=comware | aprec.
 */
export type LoginBrandKey = "comware" | "aprec";

export function getLoginBrandKey(): LoginBrandKey {
  const raw = (process.env.NEXT_PUBLIC_APP_BRAND ?? "comware").trim().toLowerCase();
  return raw === "aprec" ? "aprec" : "comware";
}

export const LOGIN_BRAND_LABEL: Record<LoginBrandKey, string> = {
  comware: "COMWARE",
  aprec: "APREC",
};

export const LOGIN_HERO_LOGO: Record<
  LoginBrandKey,
  { src: string; alt: string }
> = {
  comware: { src: "/logo_comware.png", alt: "Logo Comware" },
  aprec: { src: "/logo_comware.png", alt: "Logo APREC" },
};

export const LOGIN_USER_PLACEHOLDER: Record<LoginBrandKey, string> = {
  comware: "cora",
  aprec: "cora",
};
