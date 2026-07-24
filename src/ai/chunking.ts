export interface TextChunk {
  index: number;
  text: string;
}

const APPROXIMATE_CHARACTERS_PER_TOKEN = 4;

export function chunkClinicalText(
  text: string,
  maxTokens = 350,
  overlapTokens = 50
): TextChunk[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const maxCharacters = maxTokens * APPROXIMATE_CHARACTERS_PER_TOKEN;
  const overlapCharacters = overlapTokens * APPROXIMATE_CHARACTERS_PER_TOKEN;
  if (normalized.length <= maxCharacters) {
    return [{ index: 0, text: normalized }];
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(normalized.length, start + maxCharacters);
    if (end < normalized.length) {
      const paragraph = normalized.lastIndexOf("\n\n", end);
      const sentence = normalized.lastIndexOf(". ", end);
      const boundary = Math.max(paragraph, sentence);
      if (boundary > start + Math.floor(maxCharacters * 0.6)) {
        end = boundary + (boundary === sentence ? 1 : 0);
      }
    }
    const value = normalized.slice(start, end).trim();
    if (value) chunks.push({ index: chunks.length, text: value });
    if (end >= normalized.length) break;
    start = Math.max(start + 1, end - overlapCharacters);
  }
  return chunks;
}

export function serializeMedicalContent(content: Record<string, unknown>): string {
  return Object.entries(content)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key}: ${serializeValue(value)}`)
    .join("\n");
}

function serializeValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}
