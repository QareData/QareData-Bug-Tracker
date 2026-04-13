export function cleanText(value = "") {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[`*]/g, "")
    .replace(/\\/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(value = "") {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function escapeHtml(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function escapeAttribute(value = "") {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

export function formatPercent(done, total) {
  if (!total) {
    return "0%";
  }
  return `${Math.round((done / total) * 100)}%`;
}

export function formatFileStamp(date = new Date()) {
  const value = new Date(date);
  const datePart = [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
  const timePart = [
    String(value.getHours()).padStart(2, "0"),
    String(value.getMinutes()).padStart(2, "0"),
  ].join("-");
  return `${datePart}_${timePart}`;
}

export function formatReportDate(date = new Date()) {
  return new Date(date).toLocaleString("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
  });
}

export function truncateText(text = "", maxLength = 180) {
  const cleaned = cleanText(text);
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

export function generateId(prefix = "id") {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function uniqueTexts(items = []) {
  const seen = new Set();
  const result = [];

  items.forEach((item) => {
    const cleaned = cleanText(item);
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(cleaned);
  });

  return result;
}

export function extractMentions(texts = []) {
  const urlRegex = /\bhttps?:\/\/[^\s<>)\]]+/gi;
  const domainRegex = /\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[a-z0-9._~:/?#[\]@!$&'()*+,;=-]*)?/gi;
  const fileRegex =
    /(?:^|[\s(])([A-Za-z0-9_./-]+\.(?:png|jpe?g|gif|webp|svg|pdf|mp4|mov|webm|zip|csv|xlsx?|json|txt))(?:$|[\s).,;])/gi;
  const matches = [];

  texts
    .filter((value) => typeof value === "string" && value.trim())
    .forEach((text) => {
      const source = String(text);

      for (const match of source.matchAll(urlRegex)) {
        matches.push(match[0].replace(/[),.;]+$/g, ""));
      }

      for (const match of source.matchAll(domainRegex)) {
        matches.push(match[0].replace(/[),.;]+$/g, ""));
      }

      for (const match of source.matchAll(fileRegex)) {
        matches.push(match[1]);
      }
    });

  return uniqueTexts(matches);
}

export function blockQuoteMarkdown(text = "") {
  return String(text ?? "")
    .split(/\n+/)
    .filter(Boolean)
    .map((line) => `> ${line}`)
    .join("\n");
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function readJsonFile(file) {
  const text = await file.text();
  return JSON.parse(text);
}

export function sumBy(items, selector) {
  return items.reduce((sum, item) => sum + Number(selector(item) || 0), 0);
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
