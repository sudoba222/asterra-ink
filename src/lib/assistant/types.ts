export type Role = 'user' | 'assistant';
export interface ChatMessage { role: Role; content: string }

export type Irrigation = 'rainfed' | 'irrigated' | 'both' | 'unknown';
export type Priority = 'profit' | 'yield' | 'water' | 'soil' | 'risk' | 'unknown';

/** Farmer-provided field context (Workflow doc sections 1-2). Every part is optional; "unknown" is a valid answer. */
export interface FieldContext {
  regionId?: string;
  centroid?: { latitude: number; longitude: number };
  areaHectares?: number;
  previousCrops?: string[]; // most recent first, max 2 seasons
  irrigation?: Irrigation;
  plannedPlanting?: string; // e.g. "2027-03" or "spring"
  priority?: Priority;
  issues?: string; // pests / diseases / soil problems, free text
  budget?: string;
  soilType?: string;
}

export interface ChatRequest {
  countryCode: string;
  messages: ChatMessage[];
  field?: FieldContext;
}

export interface SourceTrace {
  tool: string;
  endpoint: string;
  ok: boolean;
  source?: string;
  lastUpdated?: string;
  dataStatus?: string;
  errorCode?: string;
}

export interface ChatResult { reply: string; sources: SourceTrace[] }

export class AssistantError extends Error {
  constructor(public code: string, message: string, public httpStatus = 500) {
    super(message);
  }
}
