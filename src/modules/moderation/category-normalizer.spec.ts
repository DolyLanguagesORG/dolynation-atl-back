import {
  buildModerationVariants,
  canonicalCategoryKey,
  cleanCategoryDisplayName,
  isOfficialCatalogCategory,
  normalizeCategoryNames,
  stripDiacriticsAndHomoglyphs,
} from './category-normalizer';

describe('category-normalizer', () => {
  describe('cleanCategoryDisplayName', () => {
    it('removes zero-width invisible characters and collapses extra whitespace', () => {
      expect(cleanCategoryDisplayName('  Música\u200B   Clásica\u00AD  ')).toBe('Música Clásica');
    });
  });

  describe('stripDiacriticsAndHomoglyphs', () => {
    it('normalizes uppercase, diaeresis, accents, fullwidth letters and Cyrillic homoglyphs', () => {
      expect(stripDiacriticsAndHomoglyphs('M Ü E R T O')).toBe('m u e r t o');
      expect(stripDiacriticsAndHomoglyphs('Canción Informática')).toBe('cancion informatica');
      expect(stripDiacriticsAndHomoglyphs('мuеrtо')).toBe('muerto');
      expect(stripDiacriticsAndHomoglyphs('ｓｅｘｏ')).toBe('sexo');
      expect(stripDiacriticsAndHomoglyphs('Scheiße Cœur Æther Português Français')).toBe(
        'scheisse coeur aether portugues francais',
      );
    });
  });

  describe('canonicalCategoryKey & isOfficialCatalogCategory', () => {
    it('generates accent/case-insensitive keys and recognizes official catalog categories', () => {
      expect(canonicalCategoryKey('  History  ')).toBe('history');
      expect(canonicalCategoryKey('Día_de-Muertos')).toBe('dia de muertos');
      expect(isOfficialCatalogCategory('Technology')).toBe(true);
      expect(isOfficialCatalogCategory('POP_CULTURE')).toBe(true);
      expect(isOfficialCatalogCategory('Pop Culture')).toBe(true);
      expect(isOfficialCatalogCategory('Quantum Computing')).toBe(false);
    });
  });

  describe('normalizeCategoryNames', () => {
    it('cleans whitespace, normalizes official catalog IDs and deduplicates case/accent variants', () => {
      const normalized = normalizeCategoryNames([
        '  Technology ',
        'technology',
        'Música Clásica',
        'musica   clasica',
        'Día de Muertos',
      ]);

      expect(normalized).toEqual(['technology', 'Música Clásica', 'Día de Muertos']);
    });
  });

  describe('buildModerationVariants', () => {
    it('builds spaced, leet, collapsed and single-char-joined variants for evasion detection', () => {
      const spacedDeath = buildModerationVariants('M ü e r t o');
      expect(spacedDeath.spaced).toBe('m u e r t o');
      expect(spacedDeath.singleCharJoined).toBe('muerto');

      const leetSex = buildModerationVariants('$3x0');
      expect(leetSex.spacedLeet).toBe('sexo');

      const elongated = buildModerationVariants('pppoooorrrnnnooo');
      expect(elongated.collapsedToOne).toBe('porno');
    });
  });
});
