import {
  buildPurityCorrectionNote,
  buildPurityFallbackSequence,
  inspectTextsPurity,
  PURITY_DEEP_FALLBACK_OPTIONS,
  PURITY_FALLBACK_OPTIONS,
  scorePuritySeverity,
} from './language-purity.guard';

describe('language-purity.guard', () => {
  it('accepts clean ES, EN, FR, and IT prose including accents and proper nouns', () => {
    expect(
      inspectTextsPurity(
        [
          'El Día de Muertos y las ofrendas',
          'Las familias colocan flores de cempasúchil y velas en los altares tradicionales.',
        ],
        'es',
      ),
    ).toEqual({ clean: true, reasons: [] });

    expect(
      inspectTextsPurity(
        [
          'L’art de la fermentation',
          "Cependant, les bactéries lactiques transforment les saveurs de façon naturelle depuis l'Antiquité.",
        ],
        'fr',
      ),
    ).toEqual({ clean: true, reasons: [] });

    expect(
      inspectTextsPurity(
        [
          "L'evoluzione dei trasporti urbani",
          'Tuttavia, le reti elettriche moderne riducono le emissioni nelle grandi città italiane.',
        ],
        'it',
      ),
    ).toEqual({ clean: true, reasons: [] });

    expect(
      inspectTextsPurity(
        [
          'History of The Beatles in London',
          'En France, The Beatles ont marqué toute une génération musicale avec leurs albums.',
        ],
        'fr',
      ),
    ).toEqual({ clean: true, reasons: [] });
  });

  it('flags non-Latin CJK/Cyrillic scripts, underscore glitches, and reasoning leaks', () => {
    const cjkReport = inspectTextsPurity(['La tradición con 出来后大灯盏 sigue viva hoy.'], 'es');
    expect(cjkReport.clean).toBe(false);
    expect(cjkReport.reasons).toContain('non_latin_script_detected');

    const glitchReport = inspectTextsPurity(
      ['Les musiciens jouaient sur les_THRones en pierre.'],
      'fr',
    );
    expect(glitchReport.clean).toBe(false);
    expect(glitchReport.reasons).toContain('underscore_token_glitch');

    const thinkReport = inspectTextsPurity(['<think>checking</think> Hola mundo'], 'es');
    expect(thinkReport.clean).toBe(false);
    expect(thinkReport.reasons).toContain('reasoning_or_markup_leak');

    const camelReport = inspectTextsPurity(
      ['El arte artesanal requiere cadaPreparation y muchos contactosBetween regiones.'],
      'es',
    );
    expect(camelReport.clean).toBe(false);
    expect(camelReport.reasons).toContain('camel_case_token_glitch');

    const rawJsonReport = inspectTextsPurity(
      ['{"literalMeaning": "Sentido literal", "explanation": "Explicación"}'],
      'es',
    );
    expect(rawJsonReport.clean).toBe(false);
    expect(rawJsonReport.reasons).toContain('raw_json_leak');
  });

  it('flags English leakage inside ES/FR/IT outputs and Romance phrases inside EN outputs', () => {
    const singleWordEs = inspectTextsPurity(
      ['La respuesta es clara, aunque podrías deepen en el proceso artesanal.'],
      'es',
    );
    expect(singleWordEs.clean).toBe(false);
    expect(singleWordEs.reasons).toContain('english_word_leak');

    const cleanAnden = inspectTextsPurity(
      ['Los pasajeros caminaron por el andén mientras el tren salía con calma.'],
      'es',
    );
    expect(cleanAnden).toEqual({ clean: true, reasons: [] });

    const cleanTechBrand = inspectTextsPurity(
      ['Muchas aplicaciones modernas usan TypeScript y GitHub para colaborar en equipo.'],
      'es',
    );
    expect(cleanTechBrand).toEqual({ clean: true, reasons: [] });

    const esImportanceLeak = inspectTextsPurity(
      ['El resumen omite la importance y diversity de apoyar a los productores locales.'],
      'es',
    );
    expect(esImportanceLeak.clean).toBe(false);
    expect(esImportanceLeak.reasons).toContain('english_word_leak');

    const frImportanceAllowed = inspectTextsPurity(
      ["Le texte souligne l'importance de la cuisine régionale."],
      'fr',
    );
    expect(frImportanceAllowed).toEqual({ clean: true, reasons: [] });

    const frCommunitiesLeak = inspectTextsPurity(
      ['Les échanges entre communities locales renforcent les traditions.'],
      'fr',
    );
    expect(frCommunitiesLeak.clean).toBe(false);
    expect(frCommunitiesLeak.reasons).toContain('english_word_leak');

    const mixedFr = inspectTextsPurity(
      ['Les chefs préparent la soupe because with local herbs they improve flavor.'],
      'fr',
    );
    expect(mixedFr.clean).toBe(false);
    expect(mixedFr.reasons).toContain('english_function_words_leak');

    const mixedIt = inspectTextsPurity(
      ['La traduzione spiegata: in this context, it means resilience.'],
      'it',
    );
    expect(mixedIt.clean).toBe(false);
    expect(mixedIt.reasons).toContain('english_phrase_leak');

    const mixedEn = inspectTextsPurity(
      ['Daily transit evolves rapidly. Sin embargo, older railways still carry freight.'],
      'en',
    );
    expect(mixedEn.clean).toBe(false);
    expect(mixedEn.reasons).toContain('foreign_phrase_leak');
  });

  it('formats actionable corrective guidance and bounded fallback options for retry prompts', () => {
    const note = buildPurityCorrectionNote('fr', ['non_latin_script_detected']);
    expect(note).toContain('French');
    expect(note).toContain('non_latin_script_detected');
    expect(note).toContain('Keep internal reasoning concise');
    expect(PURITY_FALLBACK_OPTIONS).toEqual({
      model: 'MiniMax-M3',
      reasoningEffort: 'minimal',
      temperature: 0.7,
      maxTokens: 8192,
    });
    expect(PURITY_DEEP_FALLBACK_OPTIONS).toEqual({
      model: 'MiniMax-M3',
      reasoningEffort: 'low',
      temperature: 0.65,
      maxTokens: 8192,
    });
    expect(scorePuritySeverity(['non_latin_script_detected'])).toBeGreaterThan(
      scorePuritySeverity(['english_word_leak']),
    );

    const googleFallbacks = buildPurityFallbackSequence('google');
    expect(googleFallbacks).toEqual([
      {
        provider: 'google',
        reasoningEffort: 'minimal',
        temperature: 0.7,
        maxTokens: 8192,
      },
      {
        provider: 'google',
        reasoningEffort: 'low',
        temperature: 0.65,
        maxTokens: 8192,
      },
    ]);
    expect(buildPurityFallbackSequence('minimax')).toEqual([
      PURITY_FALLBACK_OPTIONS,
      PURITY_DEEP_FALLBACK_OPTIONS,
    ]);
  });
});
