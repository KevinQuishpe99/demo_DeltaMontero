import { NextRequest, NextResponse } from "next/server";
import { runEtlVentasNetaDetalle } from "@/lib/db";

export const runtime = "nodejs";
/** SP largo: sube en Vercel Pro si hace falta (máx.300s). */
export const maxDuration = 300;

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/**
 * Vercel Cron invoca GET. Si defines CRON_SECRET o ETL_SECRET en el proyecto,
 * Vercel envía Authorization: Bearer <CRON_SECRET>; aquí validamos contra CRON_SECRET o ETL_SECRET.
 * Sin secret configurado: GET permitido (solo recomendado en local).
 */
function verifyCronGet(req: NextRequest): boolean {
  const expected =
    process.env.CRON_SECRET?.trim() || process.env.ETL_SECRET?.trim();
  if (!expected) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${expected}`;
}

async function ejecutarETL(periodo: string | null): Promise<NextResponse> {
  try {
    const { periodo: p, idEmpresas } = await runEtlVentasNetaDetalle(periodo);
    const hora = new Date().toISOString();
    return NextResponse.json({
      ok: true,
      periodo: p,
      idEmpresas,
      hora,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error ETL";
    console.error("[ETL]", msg);
    return jsonError(msg, 500);
  }
}

export async function GET(req: NextRequest) {
  if (!verifyCronGet(req)) {
    return jsonError("No autorizado", 401);
  }
  const periodo = req.nextUrl.searchParams.get("periodo");
  return ejecutarETL(periodo);
}

export async function POST(req: NextRequest) {
  const secret =
    process.env.ETL_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (!secret) {
    return jsonError(
      "Configura ETL_SECRET o CRON_SECRET para POST manual",
      503
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return jsonError("No autorizado", 401);
  }

  let periodo: string | null = null;
  try {
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const body = (await req.json()) as { periodo?: string };
      periodo = body.periodo?.trim() || null;
    }
  } catch {
    /* body vacío */
  }

  return ejecutarETL(periodo);
}
