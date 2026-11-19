import sharp from "sharp";
import { DomainError } from "../src/domain/errors";

/** Decode raster content, bound resources and re-encode without private metadata. */
export async function normalizeWorkspaceImage(base64: unknown, mime: unknown) {
  if (typeof base64 !== "string" || !base64 || base64.length > 2_800_000 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || !["image/jpeg", "image/png", "image/webp"].includes(String(mime)))
    throw new DomainError("VALIDATION_ERROR");
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length > 2 * 1024 * 1024) throw new DomainError("PAYLOAD_TOO_LARGE");
  try {
    const image = sharp(bytes, { limitInputPixels: 12_000_000, failOn: "warning", animated: false });
    const metadata = await image.metadata();
    const formats: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
    if (formats[metadata.format ?? ""] !== mime || !metadata.width || !metadata.height ||
      metadata.width < 32 || metadata.height < 32 || (metadata.pages ?? 1) !== 1)
      throw Error("invalid image");
    return (await image.rotate().resize(512, 512, { fit: "cover", position: "centre" }).flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer()).toString("base64");
  } catch { throw new DomainError("VALIDATION_ERROR"); }
}
