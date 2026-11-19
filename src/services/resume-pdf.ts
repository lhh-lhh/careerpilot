interface JpegPage {
  bytes: Uint8Array;
  width: number;
  height: number;
}
/** Minimal raster PDF writer. Rasterization keeps CJK fonts and the exact preview layout portable. */
export function jpegPagesPdf(pages: JpegPage[]): Uint8Array<ArrayBuffer> {
  if (!pages.length) throw Error("EMPTY_RESUME");
  const encoder = new TextEncoder(),
    chunks: Uint8Array[] = [];
  let length = 0;
  const append = (value: string | Uint8Array) => {
    const b = typeof value === "string" ? encoder.encode(value) : value;
    chunks.push(b);
    length += b.length;
  };
  const offsets = [0],
    obj = (id: number, content: string) => {
      offsets[id] = length;
      append(`${id} 0 obj\n${content}\nendobj\n`);
    };
  append("%PDF-1.4\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(
    2,
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ")}] >>`,
  );
  pages.forEach((page, i) => {
    const id = 3 + i * 3;
    obj(
      id,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Resume ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`,
    );
    offsets[id + 1] = length;
    append(
      `${id + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`,
    );
    append(page.bytes);
    append("\nendstream\nendobj\n");
    const drawing = "q\n595.28 0 0 841.89 0 0 cm\n/Resume Do\nQ\n";
    obj(
      id + 2,
      `<< /Length ${encoder.encode(drawing).length} >>\nstream\n${drawing}endstream`,
    );
  });
  const xref = length;
  append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for (let i = 1; i < offsets.length; i++)
    append(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  append(
    `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  );
  const result = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    result.set(chunk, at);
    at += chunk.length;
  }
  return result;
}
export async function resumePdf(pages: string[]): Promise<Blob> {
  await document.fonts.ready;
  const rendered: JpegPage[] = [];
  for (const svg of pages) {
    const url = URL.createObjectURL(
      new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
    );
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 1588;
      canvas.height = 2246;
      const context = canvas.getContext("2d");
      if (!context) throw Error("CANVAS_UNAVAILABLE");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const jpeg = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(Error("PDF_RENDER_FAILED"))),
          "image/jpeg",
          0.96,
        ),
      );
      rendered.push({
        bytes: new Uint8Array(await jpeg.arrayBuffer()),
        width: canvas.width,
        height: canvas.height,
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return new Blob([jpegPagesPdf(rendered)], { type: "application/pdf" });
}
