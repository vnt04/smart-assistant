const BLOCK_TAG_RX = /<\/(p|div|li|h[1-6]|blockquote|pre|tr|br)\s*>/gi;
const BR_TAG_RX = /<br\s*\/?>/gi;
const TAG_RX = /<[^>]+>/g;
const WS_RX = /\s+/g;

const ENTITY_MAP: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

export function htmlToText(html: string): string {
  if (!html) return "";
  const withBreaks = html
    .replace(BR_TAG_RX, "\n")
    .replace(BLOCK_TAG_RX, "$&\n");
  const stripped = withBreaks.replace(TAG_RX, "");
  const decoded = stripped.replace(
    /&(?:nbsp|amp|lt|gt|quot|#39|apos);/g,
    (m) => ENTITY_MAP[m] ?? m,
  );
  return decoded.replace(WS_RX, " ").trim();
}

export function excerpt(text: string, max = 200): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
