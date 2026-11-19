export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string = code,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
export function requireCondition(
  condition: unknown,
  code = "VALIDATION_ERROR",
  message?: string,
): asserts condition {
  if (!condition) throw new DomainError(code, message);
}
