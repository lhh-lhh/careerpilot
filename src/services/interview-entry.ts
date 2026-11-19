/** One-use, memory-only intent: a refresh/deep link must never start audio. */
let pendingPracticeSession: string | undefined;
export function rememberPracticeStart(id: string) {
  pendingPracticeSession = id;
}
export function consumePracticeStart(id: string): boolean {
  const matches = pendingPracticeSession === id;
  pendingPracticeSession = undefined;
  return matches;
}
