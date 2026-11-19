import { ref } from 'vue';
/** Explicit user-approved default; memory-only and never triggers calls itself. */
export const aiConsent=ref(true);
export function setAiConsent(enabled:boolean){aiConsent.value=enabled;}
