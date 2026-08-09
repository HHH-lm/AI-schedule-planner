export function buildObsidianUrl(vault: string, note?: string): string {
  const params = [`vault=${encodeURIComponent(vault)}`];
  if (note) params.push(`file=${encodeURIComponent(note)}`);
  return `obsidian://open?${params.join("&")}`;
}

export function parseObsidianUrl(
  raw: string
): { vault?: string; file?: string } {
  const trimmed = raw.trim();
  if (!trimmed || !trimmed.toLowerCase().startsWith("obsidian://")) return {};
  try {
    const url = new URL(trimmed);
    const vault = url.searchParams.get("vault");
    const file = url.searchParams.get("file");
    return {
      vault: vault ?? undefined,
      file: file ?? undefined,
    };
  } catch {
    return {};
  }
}
