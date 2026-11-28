/** Eventos trazables del flujo de prompts e inferencia con IA en lecturas. */
export type PromptEvent =
  | 'text_generated'
  | 'text_generation_failed'
  | 'reading_evaluated'
  | 'reading_evaluation_failed'
  | 'word_explained'
  | 'word_explanation_failed';
