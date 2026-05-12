export function normalizePdfText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g, " ")
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeFilenameForPdf(value) {
  return normalizePdfText(value)
    .replace(/[<>:"/\\|?*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncateCaption(value, maxLength = 64) {
  const cleaned = sanitizeFilenameForPdf(value);
  if (cleaned.length <= maxLength) return cleaned;
  const truncated = cleaned.slice(0, Math.max(0, maxLength - 1)).replace(/[\s._-]+$/g, "").trim();
  return `${truncated}…`;
}

export function softenPdfText(value) {
  const normalized = normalizePdfText(value);
  return normalized
    .replace(/(https?:\/\/|www\.)/gi, "$1\u200b")
    .replace(/([/._@?&=:#-])/g, "$1\u200b")
    .replace(/(\S{18})(?=\S)/g, "$1\u200b");
}

export function wrapPdfText(pdf, text, width, options = {}) {
  const normalized = normalizePdfText(text);
  const wrapped = pdf.splitTextToSize(softenPdfText(normalized), Math.max(24, width));
  const lines = Array.isArray(wrapped) ? wrapped.filter(Boolean) : [String(wrapped || "")].filter(Boolean);
  const maxLines = Number.isFinite(options.maxLines) && options.maxLines > 0 ? Math.floor(options.maxLines) : Infinity;
  const outputLines = lines.slice(0, maxLines);
  const lineHeight = options.lineHeight || Math.max(10, Math.round((pdf.getFontSize?.() || 10) * 1.22));
  const computedHeight = outputLines.length ? outputLines.length * lineHeight : 0;
  const longestLineWidth = outputLines.reduce((maxWidth, line) => Math.max(maxWidth, pdf.getTextWidth(line)), 0);

  return {
    lines: outputLines,
    computedHeight,
    longestLineWidth,
    lineHeight,
    lineCount: outputLines.length,
  };
}
