import { expect, it } from "vitest";
import { contrastRatio } from "../../src/domain/design/contrast";
it("WCAG black on white is 21, identical colors 1", () => {
  expect(contrastRatio("#000000", "#ffffff")).toBe(21);
  expect(contrastRatio("#ffffff", "#ffffff")).toBe(1);
  expect(contrastRatio("#000", "#fff")).toBe(21);
  expect(() => contrastRatio("red", "#ffffff")).toThrow();
});
