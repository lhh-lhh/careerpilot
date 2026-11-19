// A valid one-page, fictional PDF fixture, not a text file mislabeled as PDF.
export function createTeachingProof(): Blob {
  const stream =
    "BT /F1 16 Tf 48 780 Td (CareerPilot - fictional teaching proof) Tj 0 -28 Td /F1 11 Tf (No legal validity. No real personal information.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n% 教学示例证明，无真实信息\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(new TextEncoder().encode(pdf).length);
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([pdf], { type: "application/pdf" });
}
