import { checkCategoryBlacklist } from './category-blacklist';

describe('category-blacklist (Filter 1)', () => {
  it('blocks explicit death, sexual, profanity, drugs and spam words across ES, EN, FR and IT', () => {
    const blockedCases = [
      // ES + EN
      'Muertos',
      'Muerte violenta',
      'Pornografía',
      'Sexo explícito',
      'Pene',
      'Suicidio',
      'Asesinato',
      'Pendejo',
      'Cocaína',
      'asdfgh',
      'qwerty',
      'Coño',
      // FR
      'Putain',
      'Salope',
      'Connard',
      'Cadavre',
      'Meurtre',
      'Fils de pute',
      'azerty',
      // IT
      'Vaffanculo',
      'Puttana',
      'Coglione',
      'Stronzo',
      'Cadavere',
      'Omicidio',
      'Figlio di puttana',
      'Stupro',
    ];

    for (const input of blockedCases) {
      const result = checkCategoryBlacklist(input);
      expect(result.blocked).toBe(true);
    }
  });

  it('blocks obfuscated evasion attempts (uppercase, diaeresis, spaces, dots, leetspeak, homoglyphs, repetitions)', () => {
    const obfuscatedCases = [
      'M Ü E R T O',
      'm u e r t o',
      'm.u.e.r.t.o',
      'm-u_e-r+t-o',
      'Muuuueeeerrrtooo',
      'S 3 X 0',
      '$3x0',
      'P0rn0',
      'p e n e',
      'мuеrtоs',
      'verpornogratis',
      's_u_i_c_i_d_i_o',
    ];

    for (const input of obfuscatedCases) {
      const result = checkCategoryBlacklist(input);
      expect(result.blocked).toBe(true);
    }
  });

  it('allows legitimate cultural, historical, scientific and educational categories without false positives', () => {
    const allowedCases = [
      'Día de Muertos',
      'Día de los Muertos',
      'Day of the Dead',
      'Segunda Guerra Mundial',
      'World War II',
      'Cold War',
      'Forensic Science',
      'Human Anatomy',
      'Cono Sur',
      'Software Testing',
      'Año Nuevo',
      'Penélope',
      'Mar Muerto',
      'Astronomía Moderna',
      'Desarrollo Backend',
      // FR + IT safe cultural/historical phrases and false-positive guards
      'Seconde Guerre Mondiale',
      'Nature morte',
      'Mer Morte',
      'Seconda Guerra Mondiale',
      'Natura Morta',
      'Mar Morto',
      'Anatomia Umana',
      'Articolo Scientifico',
      'Literary Heroines',
    ];

    for (const input of allowedCases) {
      const result = checkCategoryBlacklist(input);
      expect(result.blocked).toBe(false);
    }
  });

  it('still blocks safe phrases if combined with another prohibited term', () => {
    const mixed = checkCategoryBlacklist('Día de Muertos porno');
    expect(mixed.blocked).toBe(true);
  });
});
