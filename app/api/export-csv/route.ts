import { NextRequest } from "next/server";
import {
  BI_SKILL_TOOL_NAMES,
  type BiSkillToolName,
} from "@/lib/biSkillTools";
import { runExportCsvQuery } from "@/lib/runExportCsvQuery";
import { runExportXlsxQuery } from "@/lib/runExportXlsxQuery";

function isSkillName(s: string): s is BiSkillToolName {
  return (BI_SKILL_TOOL_NAMES as readonly string[]).includes(s);
}

export async function POST(req: NextRequest) {
  let body: {
    skill?: string;
    sql?: string;
    chunked?: boolean;
    chunkSize?: number;
    /** csv (default) | xlsx */
    format?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const skill = body.skill?.trim() ?? "";
  const sql = body.sql?.trim() ?? "";
  if (!skill || !sql) {
    return new Response(
      JSON.stringify({ error: "skill y sql son requeridos" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  if (!isSkillName(skill)) {
    return new Response(JSON.stringify({ error: "skill no permitida" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const fmt = (body.format ?? "csv").trim().toLowerCase();
    if (fmt !== "csv" && fmt !== "xlsx") {
      return new Response(
        JSON.stringify({ error: "format debe ser csv o xlsx" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const chunkSize =
      typeof body.chunkSize === "number" && Number.isFinite(body.chunkSize)
        ? Math.floor(body.chunkSize)
        : undefined;
    const opts = {
      chunked: body.chunked !== false,
      chunkSize,
    };

    const headers = new Headers();

    if (fmt === "xlsx") {
      const { buffer, rowCount, truncated, chunks } = await runExportXlsxQuery(
        skill,
        sql,
        opts
      );
      headers.set(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      headers.set(
        "Content-Disposition",
        'attachment; filename="cora-export.xlsx"'
      );
      headers.set("X-Export-Row-Count", String(rowCount));
      headers.set("X-Export-Chunks", String(chunks));
      if (truncated) headers.set("X-Export-Truncated", "1");
      return new Response(new Uint8Array(buffer), { headers });
    }

    const { csv, rowCount, truncated, chunks } = await runExportCsvQuery(
      skill,
      sql,
      opts
    );
    headers.set("Content-Type", "text/csv; charset=utf-8");
    headers.set(
      "Content-Disposition",
      'attachment; filename="cora-export.csv"'
    );
    headers.set("X-Export-Row-Count", String(rowCount));
    headers.set("X-Export-Chunks", String(chunks));
    if (truncated) headers.set("X-Export-Truncated", "1");
    return new Response("\uFEFF" + csv, { headers });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al exportar";
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}
