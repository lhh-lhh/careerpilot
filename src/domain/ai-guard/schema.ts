import {
  AiResponse as response,
  ReplayRecord as replay,
  A1,
  A2,
  A3,
  A7,
} from "../../contracts/generated/ai-validators.js";
const validators: Record<string, (data: unknown) => boolean> = {
  A1,
  A2,
  A3,
  A7,
};
export function validatePayload(
  module: string,
  operation: string,
  value: unknown,
): boolean {
  return (
    !!validators[module]?.(value) &&
    (value as { operation: string }).operation === operation
  );
}
export function validateResponse(value: unknown): boolean {
  return !!response(value);
}
export function validateReplay(value: unknown): boolean {
  return !!replay(value);
}
