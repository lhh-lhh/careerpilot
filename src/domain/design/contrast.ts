export function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string): number => {
    if (/^#[0-9a-f]{3}$/i.test(hex))
      hex = "#" + [...hex.slice(1)].map((c) => c + c).join("");
    if (!/^#[0-9a-f]{6}$/i.test(hex))
      throw new Error("Expected six-digit hex color");
    const channels = [1, 3, 5].map((offset) => {
      const v = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return channels.reduce(
      (sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i]!,
      0,
    );
  };
  const a = luminance(foreground),
    b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
