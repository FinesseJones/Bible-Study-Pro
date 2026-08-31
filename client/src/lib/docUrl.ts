/**
 * docUrl.ts
 * Converts any document URL (file://, http://, blob:, Google Drive, etc.)
 * into a URL the browser can actually render inside an <iframe> or <embed>.
 */

export function getViewableUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;

  // Already a blob: URL (from in-memory upload)
  if (rawUrl.startsWith("blob:")) return rawUrl;

  // Google Drive folder → use embedded folderview
  if (rawUrl.includes("drive.google.com") && rawUrl.includes("/folders/")) {
    const parts = rawUrl.split("/folders/");
    if (parts[1]) {
      const folderId = parts[1].split(/[?#&]/)[0];
      return `https://drive.google.com/embeddedfolderview?id=${folderId}#grid`;
    }
  }

  // Google Drive file share link → extract file ID and use the embeddable /preview URL
  // (docs.google.com/viewer returns raw HTML; /preview renders the native PDF viewer)
  if (rawUrl.includes("drive.google.com")) {
    const fileIdMatch = rawUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileIdMatch) {
      return `https://drive.google.com/file/d/${fileIdMatch[1]}/preview`;
    }
    // Already a preview or embeddedfolderview URL
    if (rawUrl.includes("/preview") || rawUrl.includes("embeddedfolderview")) {
      return rawUrl;
    }
    // Last resort — try the viewer
    return `https://docs.google.com/viewer?url=${encodeURIComponent(rawUrl)}&embedded=true`;
  }

  // Normal https:// links (S3, CDN, etc.)
  if (rawUrl.startsWith("https://") || rawUrl.startsWith("http://")) {
    return rawUrl;
  }

  // Local file:// path — proxy through our server endpoint
  if (rawUrl.startsWith("file://") || rawUrl.startsWith("/")) {
    return `/api/documents/serve?path=${encodeURIComponent(rawUrl)}`;
  }

  // Fallback — try raw
  return rawUrl;
}

/**
 * Returns true if this URL points to a PDF file.
 */
export function isPdf(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.toLowerCase().includes(".pdf");
}

/**
 * Returns true if this URL points to a plain-text or markdown file.
 */
export function isText(url: string | null | undefined): boolean {
  if (!url) return false;
  const u = url.toLowerCase();
  return u.endsWith(".txt") || u.endsWith(".md") || u.endsWith(".html") || u.endsWith(".htm");
}
