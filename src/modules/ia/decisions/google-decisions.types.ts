/** Pregunta booleana binaria (`noul`) evaluada como probabilidad calibrada en `0..1`. */
export interface DecisionNoulQuestion {
  type: 'noul';
  instructions: string;
}

/** Pregunta de selección cerrada (`choice`) entre 2 y 255 opciones definidas en `criteria`. */
export interface DecisionChoiceQuestion {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string>;
}

/** Pregunta de rúbrica ordenada (`score`) sobre criterios discretos en orden ascendente. */
export interface DecisionScoreQuestion {
  type: 'score';
  instructions: string;
  criteria: readonly string[] | Record<string, string>;
}

/** Cualquier tipo de pregunta soportado por Gemini Decisions API (`gemini-decision-1`). */
export type DecisionQuestion =
  DecisionNoulQuestion | DecisionChoiceQuestion | DecisionScoreQuestion;

/** Solicitud de evaluación condicional contra Google Decisions API. */
export interface CreateDecisionRequest {
  input: string;
  questions: Record<string, DecisionQuestion>;
  model?: string;
  timeoutMs?: number;
}

/** Respuesta normalizada para preguntas `noul` (probabilidad afirmativa y confianza). */
export interface DecisionNoulAnswer {
  type: 'noul';
  noul: number;
  confidence: number;
}

/** Respuesta normalizada para preguntas `choice` (opción ganadora y distribución). */
export interface DecisionChoiceAnswer {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

/** Respuesta normalizada para preguntas `score` (puntaje esperado ponderado y leyenda). */
export interface DecisionScoreAnswer {
  type: 'score';
  score: number;
  probabilities: Record<string, number>;
  legend: Record<string, string>;
  confidence: number;
}

/** Unión discriminada de respuestas tipadas devueltas por `GoogleDecisionsService`. */
export type DecisionAnswer = DecisionNoulAnswer | DecisionChoiceAnswer | DecisionScoreAnswer;

/** Conteo de tokens reportado por Decisions API (`totalOutputTokens` siempre es `0`). */
export interface DecisionUsage {
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

/** Resultado completo devuelto por `GoogleDecisionsService.decide`. */
export interface CreateDecisionResponse {
  answers: Record<string, DecisionAnswer | undefined>;
  usage?: DecisionUsage;
}
