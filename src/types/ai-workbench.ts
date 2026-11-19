export interface ResumePatch { id: string; section: 'experience' | 'projects'; rowId: string; before: string; after: string; reason: string; requiresUserInput: boolean }
export interface AiProvenance { traceId:string; provider:'deepseek'; model:string; createdAt:string; upstreamRequestId?:string; usage?:{prompt:number;completion:number} }
export interface OcrResult { page_count:number; pages:{index:number;text:string;finish_reason:'stop'|'length'}[]; provenance:AiProvenance }
export interface ResumeOptimization { summary: string; patches: ResumePatch[]; provenance?:AiProvenance }
export interface InterviewTarget { title: string; requirements: string; sourceUrl?: string }
export interface TurnEvaluation { dimensions: { key: string; label: string; score: number; evidence: string; reason: string }[]; total: number; strengths: string[]; improvements: string[]; rubricVersion: string; provenance?:AiProvenance }
export interface InterviewTurn { id: string; question: string; answer: string | null; evaluation: TurnEvaluation | null; evaluationError?: string; questionProvenance?:AiProvenance }
export interface VoiceSession { id: string; revision: number; target: InterviewTarget; state: 'active' | 'completed'; turns: InterviewTurn[]; createdAt: string; updatedAt: string; feedback?: string; error?: string }
export interface MatchPreferences { role: string; city: string; salaryMin: number | null; industry: string; strictCity: boolean }
export interface MatchCandidate { id: string; title: string; employer: string; location: string | null; salaryText: string; sourceName: string; url: string; localJobId?: string; description: string; score: number | null; reasons: string[]; gaps: string[]; coverage: string; observedAt: string; category: 'recommended' | 'verify' | 'excluded'; aiRank?:number; aiReasons?:string[]; aiGaps?:string[] }
export interface MatchResults { items: MatchCandidate[]; resumeVersionId: string | null; asOf: string; preferences?: MatchPreferences; provenance?:AiProvenance; mode?:'EMPTY' }
export interface Conversation { id: string; title: string; updatedAt: string; messages?: { role: 'user' | 'assistant'; content: string; provenance?:AiProvenance }[] }
export interface WorkbenchStatus { enabled: boolean; model: string; limits: { dailyGlobalCalls: number; dailyUserCalls: number; maxOutputTokens: number }; mode: string }
