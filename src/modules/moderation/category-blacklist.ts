import { buildModerationVariants, type NormalizedCategoryVariants } from './category-normalizer';

/** Resultado de evaluación de la capa de blacklist. */
export interface BlacklistCheckResult {
  blocked: boolean;
  reason?: string;
}

/**
 * Frases educativas o culturales legítimas que contienen términos sensibles
 * (p. ej. "Día de Muertos", "Guerra Mundial") para que pasen a validación semántica
 * sin ser bloqueadas por palabras contextuales de muerte/guerra.
 */
const SAFE_EDUCATIONAL_PHRASES: readonly string[] = [
  'dia de muertos',
  'dia de los muertos',
  'day of the dead',
  'primera guerra mundial',
  'segunda guerra mundial',
  'guerra mundial',
  'world war',
  'world war i',
  'world war ii',
  'guerra fria',
  'cold war',
  'guerra civil',
  'civil war',
  'ciencia forense',
  'ciencias forenses',
  'forensic science',
  'medicina forense',
  'anatomia humana',
  'human anatomy',
  'pena de muerte',
  'death penalty',
  'mar muerto',
  'dead sea',
];

/**
 * Palabras prohibidas inequívocas (evaluadas por límites de palabra en múltiples variantes).
 * Incluye contenido sexual explícito, gore, autolesión, insultos, odio, drogas duras y spam obvio.
 */
const HARD_BLACKLIST_WORDS: readonly string[] = [
  // Sexual / Pornográfico (ES + EN)
  'sexo',
  'sexual',
  'sexuales',
  'sex',
  'sexually',
  'porn',
  'porno',
  'pornografia',
  'pornografico',
  'pornografica',
  'pornography',
  'pornographic',
  'xxx',
  'nsfw',
  'hentai',
  'ecchi',
  'rule34',
  'erotico',
  'erotica',
  'erotic',
  'erotismo',
  'pene',
  'penes',
  'penis',
  'vagina',
  'vaginas',
  'vulva',
  'clitoris',
  'verga',
  'vergas',
  'pito',
  'pitos',
  'polla',
  'pollas',
  'chocha',
  'panocha',
  'chichi',
  'chichis',
  'teta',
  'tetas',
  'boobs',
  'boob',
  'tits',
  'titties',
  'culo',
  'culos',
  'nalgas',
  'ass',
  'asshole',
  'dick',
  'dicks',
  'dickhead',
  'cock',
  'cocks',
  'pussy',
  'cunt',
  'dildo',
  'vibrador',
  'whore',
  'slut',
  'skank',
  'prostituta',
  'prostituto',
  'prostitucion',
  'prostitute',
  'prostitution',
  'puta',
  'putas',
  'puto',
  'putos',
  'putita',
  'putito',
  'zorra',
  'ramera',
  'escort',
  'burdel',
  'brothel',
  'orgia',
  'orgias',
  'orgy',
  'orgasmo',
  'orgasmos',
  'orgasm',
  'masturbacion',
  'masturbarse',
  'masturbar',
  'masturbate',
  'masturbation',
  'eyaculacion',
  'eyacular',
  'ejaculation',
  'semen',
  'esperma',
  'cum',
  'felacion',
  'blowjob',
  'handjob',
  'deepthroat',
  'cunnilingus',
  'rimjob',
  'anal',
  'sodomia',
  'sodomy',
  'bdsm',
  'fetish',
  'fetiche',
  'fetiches',
  'stripper',
  'striptease',
  'onlyfans',
  'xvideos',
  'pornhub',
  'xnxx',
  'redtube',
  'chaturbate',
  'camgirl',
  'nude',
  'nudes',
  'desnudo',
  'desnudos',
  'desnuda',
  'desnudas',
  'desnudez',
  'incesto',
  'incest',
  'milf',
  'bukkake',
  'ninfomania',
  'pedofilia',
  'pedofilo',
  'pedofila',
  'pedophilia',
  'pedophile',
  'pederasta',
  'necrofilia',
  'necrofilo',
  'necrophilia',
  'zoofilia',
  'zoophilia',
  'bestialidad',
  'bestiality',

  // Gore / Violencia extrema / Autolesión / Crímenes graves (ES + EN)
  'gore',
  'snuff',
  'cadaver',
  'cadaveres',
  'corpse',
  'corpses',
  'suicidio',
  'suicidios',
  'suicidarse',
  'suicida',
  'suicide',
  'suicidal',
  'autolesion',
  'autolesiones',
  'autolesionarse',
  'selfharm',
  'asesinato',
  'asesinatos',
  'asesinar',
  'asesino',
  'asesinos',
  'homicidio',
  'homicidios',
  'feminicidio',
  'feminicidios',
  'femicide',
  'infanticidio',
  'parricidio',
  'murder',
  'murderer',
  'homicide',
  'manslaughter',
  'matanza',
  'masacre',
  'massacre',
  'genocidio',
  'genocide',
  'decapitacion',
  'decapitar',
  'decapitado',
  'beheading',
  'behead',
  'descuartizar',
  'descuartizado',
  'descuartizamiento',
  'desmembramiento',
  'desmembrar',
  'dismember',
  'dismemberment',
  'mutilacion',
  'mutilar',
  'tortura',
  'torturar',
  'torture',
  'canibalismo',
  'canibal',
  'cannibalism',
  'violacion',
  'violar',
  'violador',
  'rape',
  'rapist',
  'secuestro',
  'secuestrar',
  'kidnapping',
  'terrorismo',
  'terrorista',
  'terrorism',
  'terrorist',
  'tiroteo',
  'sicario',
  'sicarios',
  'narco',
  'narcos',
  'narcotrafico',
  'narcotraficante',
  'ejecucion',

  // Groserías, insultos y discurso de odio (ES + EN)
  'mierda',
  'caca',
  'shit',
  'bullshit',
  'crap',
  'fuck',
  'fucking',
  'fucker',
  'motherfucker',
  'bitch',
  'pendejo',
  'pendeja',
  'pendejos',
  'pendejada',
  'cabron',
  'cabrona',
  'cabrones',
  'chingar',
  'chingada',
  'chingado',
  'chingon',
  'culero',
  'culera',
  'maricon',
  'marica',
  'joto',
  'faggot',
  'fag',
  'nigger',
  'nigga',
  'nazi',
  'nazismo',
  'kkk',
  'racismo',
  'racista',
  'xenofobia',
  'homofobia',
  'estupido',
  'estupida',
  'idiota',
  'imbecil',
  'bastardo',
  'bastard',
  'maldito',
  'pinche',
  'mamada',
  'mamadas',
  'huevon',
  'weon',
  'boludo',
  'pelotudo',
  'gonorrea',
  'malparido',
  'hijueputa',
  'retard',
  'retarded',

  // Drogas ilícitas
  'cocaina',
  'cocaine',
  'heroina',
  'heroin',
  'metanfetamina',
  'meth',
  'methamphetamine',
  'fentanilo',
  'fentanyl',
  'crack',
  'lsd',
  'mdma',
  'marihuana',
  'mota',
  'weed',
  'narcoticos',
  'narcotics',

  // Spam / Relleno obvio
  'asdf',
  'asdfg',
  'asdfgh',
  'asdfghjkl',
  'qwerty',
  'qwertyuiop',
  'zxcvbn',
  'zxcvbnm',
  'qazwsx',
  'lorem',
  'ipsum',
  'spam',
  'basura',
  'ninguno',
  'ninguna',
  'equis',
  'jajaja',
  'jajajaja',
  'lmao',
  'lmfao',
  'stfu',
  'omfg',
  'wtf',
];

/**
 * Palabras sensibles de muerte/violencia que se bloquean si aparecen fuera de
 * frases culturales o históricas explícitamente seguras (`SAFE_EDUCATIONAL_PHRASES`).
 */
const CONTEXTUAL_DEATH_WORDS: readonly string[] = [
  'muerto',
  'muertos',
  'muerta',
  'muertas',
  'muerte',
  'muertes',
  'dead',
  'death',
  'kill',
  'killing',
  'killer',
  'matar',
  'ataud',
  'funeraria',
];

/**
 * Frases multi-palabra prohibidas (evaluadas sobre texto con espacios normalizados).
 */
const HARD_BLACKLIST_PHRASES: readonly string[] = [
  'dead body',
  'dead bodies',
  'mass shooting',
  'white supremacy',
  'supremacia blanca',
  'son of a bitch',
  'hijo de puta',
  'hijos de puta',
  'cartel de drogas',
  'self harm',
  'auto lesion',
  'lorem ipsum',
  'sin sentido',
  'cualquier cosa',
];

/**
 * Subcadenas inequívocas (≥5 caracteres sin ambigüedad con palabras legítimas)
 * que detectan términos prohibidos incluso concatenados sin espacios (p. ej. `"m u e r t o"` o `"verpornogratis"`).
 */
const COMPACT_UNAMBIGUOUS_SUBSTRINGS: readonly string[] = [
  'porno',
  'pornograf',
  'pornhub',
  'xvideos',
  'onlyfans',
  'hentai',
  'bukkake',
  'striptease',
  'necrofil',
  'pedofil',
  'pederast',
  'zoofil',
  'bestialid',
  'suicid',
  'autolesion',
  'feminicid',
  'descuartiz',
  'desmembr',
  'decapit',
  'masturb',
  'eyaculac',
  'prostituc',
  'narcotrafic',
  'motherfuck',
  'hijueputa',
  'malparid',
  'metanfetamin',
  'fentanil',
  'cunniling',
  'deepthroat',
  'blowjob',
  'handjob',
  'clitoris',
  'orgasmo',
  'cadaver',
  'asesinat',
  'homicid',
  'violacion',
  'vagina',
  'pussy',
  'dildo',
  'faggot',
  'nigger',
  'chingad',
  'pendej',
  'cabron',
  'asdfgh',
  'qwerty',
  'zxcvbn',
];

const HARD_WORDS_SET = new Set<string>(HARD_BLACKLIST_WORDS);
const CONTEXTUAL_DEATH_SET = new Set<string>(CONTEXTUAL_DEATH_WORDS);

function hasBlockedWord(text: string, wordSet: ReadonlySet<string>): boolean {
  if (text.length === 0) return false;
  const tokens = text.split(' ');
  return tokens.some((token) => wordSet.has(token));
}

function hasBlockedPhrase(variants: readonly string[], phrases: readonly string[]): boolean {
  return variants.some((v) =>
    phrases.some(
      (phrase) =>
        v === phrase ||
        v.includes(` ${phrase} `) ||
        v.startsWith(`${phrase} `) ||
        v.endsWith(` ${phrase}`),
    ),
  );
}

function stripSafePhrases(spacedText: string): string {
  let result = ` ${spacedText} `;
  for (const phrase of SAFE_EDUCATIONAL_PHRASES) {
    result = result.replaceAll(` ${phrase} `, ' ');
  }
  return result.replace(/\s+/g, ' ').trim();
}

function checkVariantsAgainstWords(
  variants: NormalizedCategoryVariants,
  wordSet: ReadonlySet<string>,
): boolean {
  const candidates = [
    variants.spaced,
    variants.spacedLeet,
    variants.collapsedToOne,
    variants.collapsedToTwo,
    variants.singleCharJoined,
    variants.spacedSingleCharJoined,
    variants.singleCharJoined.replace(/(.)\1+/g, '$1'),
    variants.spacedSingleCharJoined.replace(/(.)\1+/g, '$1'),
  ];
  return candidates.some((candidate) => hasBlockedWord(candidate, wordSet));
}

/**
 * Ejecuta el **Filtro 1 (Blacklist normalizada)** sobre una categoría dinámica.
 * Normaliza a minúsculas, elimina acentos/diéresis, leetspeak, espacios intercalados
 * y repetición de letras antes de contrastar contra palabras y raíces prohibidas.
 */
export function checkCategoryBlacklist(rawCategory: string): BlacklistCheckResult {
  const variants = buildModerationVariants(rawCategory);

  const spacedCandidates = [
    variants.spaced,
    variants.spacedLeet,
    variants.collapsedToOne,
    variants.collapsedToTwo,
    variants.singleCharJoined,
    variants.spacedSingleCharJoined,
  ];

  // 0) Términos sensibles con 'ñ' evaluados antes de eliminar tildes (evita falsos positivos como "cono" / "año").
  const rawNormalized = rawCategory.normalize('NFKC').toLowerCase();
  if (/(?:^|[^a-záéíóúüñ0-9])coñ(?:o|os|a|as)(?:$|[^a-záéíóúüñ0-9])/i.test(rawNormalized)) {
    return { blocked: true, reason: 'prohibited_term_in_blacklist' };
  }

  // 1) Palabras y frases inequívocamente prohibidas (siempre bloqueadas, sin excepciones).
  if (
    checkVariantsAgainstWords(variants, HARD_WORDS_SET) ||
    hasBlockedPhrase(spacedCandidates, HARD_BLACKLIST_PHRASES)
  ) {
    return { blocked: true, reason: 'prohibited_term_in_blacklist' };
  }

  // 2) Subcadenas compactas sin espacios para detectar concatenaciones evasivas.
  const compactCandidates = [
    variants.compact,
    variants.compactCollapsed,
    variants.compactCollapsedTwo,
  ];
  if (
    compactCandidates.some((compact) =>
      COMPACT_UNAMBIGUOUS_SUBSTRINGS.some((sub) => compact.includes(sub)),
    )
  ) {
    return { blocked: true, reason: 'prohibited_obfuscated_term_in_blacklist' };
  }

  // 3) Palabras sensibles de muerte fuera de frases culturales/históricas legítimas.
  const remainingSpaced = stripSafePhrases(variants.spaced);
  const remainingLeet = stripSafePhrases(variants.spacedLeet);
  const remainingCollapsed = stripSafePhrases(variants.collapsedToOne);
  const remainingSingleJoined = stripSafePhrases(variants.singleCharJoined);
  const remainingSpacedSingleJoined = stripSafePhrases(variants.spacedSingleCharJoined);

  const contextualPool = [
    remainingSpaced,
    remainingLeet,
    remainingCollapsed,
    remainingSingleJoined,
    remainingSpacedSingleJoined,
    remainingSingleJoined.replace(/(.)\1+/g, '$1'),
    remainingSpacedSingleJoined.replace(/(.)\1+/g, '$1'),
  ];
  if (contextualPool.some((txt) => hasBlockedWord(txt, CONTEXTUAL_DEATH_SET))) {
    return { blocked: true, reason: 'sensitive_death_or_violence_term' };
  }

  return { blocked: false };
}
