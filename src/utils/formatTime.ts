/**
 * Formata segundos inteiros para o padrão HH:MM:SS (ex: 01:42:18).
 * Suporta durações acima de 99 horas sem truncar dígitos.
 */
export function formatSeconds(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/**
 * Formata o tempo líquido acumulado em milissegundos para o visor principal,
 * separando HH:MM:SS e o dígito discreto de décimos de segundo ("0" a "9").
 */
export function formatMainClock(
  totalActiveMs: number | undefined,
  fallbackTotalActiveSec = 0,
): { main: string; tenths: string } {
  const safeSec = Math.max(
    0,
    Math.floor(Number.isFinite(fallbackTotalActiveSec) ? fallbackTotalActiveSec : 0),
  );
  const rawMs =
    typeof totalActiveMs === "number" && Number.isFinite(totalActiveMs)
      ? Math.max(0, Math.floor(totalActiveMs))
      : 0;
  const effectiveMs = rawMs >= safeSec * 1000 ? rawMs : safeSec * 1000;
  const wholeSeconds = Math.floor(effectiveMs / 1000);
  const tenthsDigit = Math.floor((effectiveMs % 1000) / 100);

  return {
    main: formatSeconds(wholeSeconds),
    tenths: String(tenthsDigit),
  };
}

/**
 * Converte data YYYY-MM-DD para DD/MM/YYYY.
 */
export function formatDateBR(isoDate: string): string {
  if (!isoDate) return "--/--/----";
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

/**
 * Extrai HH:MM local de um timestamp ISO-8601 / RFC3339.
 */
export function formatIsoTimeHHMM(isoTimestamp: string | null | undefined): string {
  if (!isoTimestamp) return "--:--";
  // Caso padrão ISO-8601 com hora local preservada (ex: 2026-10-29T14:05:12-03:00)
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(isoTimestamp);
  if (match && !isoTimestamp.endsWith("Z")) {
    return match[2];
  }
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) return "--:--";
  const hh = String(parsed.getHours()).padStart(2, "0");
  const mm = String(parsed.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Formata intervalo Início–Fim (ex: 14:00–15:30).
 */
export function formatSessionRange(startTime: string, endTime: string | null): string {
  const start = formatIsoTimeHHMM(startTime);
  const end = endTime ? formatIsoTimeHHMM(endTime) : "--:--";
  return `${start}–${end}`;
}

/**
 * Filtra sugestões de matérias para autocomplete de forma insensível a acentos e caixa.
 */
export function filterSubjectSuggestions(subjects: string[], query: string): string[] {
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const trimmedQuery = query.trim();
  const normalizedQuery = normalize(trimmedQuery);
  if (!normalizedQuery) {
    return subjects.slice(0, 8);
  }

  return subjects
    .filter((item) => {
      const normItem = normalize(item);
      return normItem.includes(normalizedQuery) && item.trim() !== trimmedQuery;
    })
    .slice(0, 8);
}
