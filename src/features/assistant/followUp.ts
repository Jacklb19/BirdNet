import { plan, validPlan, type PlanIntent, type PlanPeriod, type ReadPlan, type RelativePeriod } from './plan';

/**
 * What a message asks, when the phone can tell by itself (ADR-47): a new or adjusted plan, opening a result that is
 * on screen, the next page, or starting over. Anything else is `model`: it needs the text interpreted, with consent.
 * The rules are deliberately narrow: a message is resolved here only when every word of it is understood, so a
 * private reference ("the outing at the wetland") is never silently dropped from what the person asked.
 */
export type FollowUp =
  | { readonly kind: 'plan'; readonly plan: ReadPlan }
  | { readonly kind: 'open'; readonly index: number }
  | { readonly kind: 'more' }
  | { readonly kind: 'reset' }
  | { readonly kind: 'model' };

/** Common and scientific names of the catalogue, by scientific name; any column (Spanish, English) may match. */
export type NameTable = Readonly<Record<string, readonly string[]>>;

const PERIODS: readonly (readonly [string, RelativePeriod | 'all'])[] = [
  ['ultimos 7 dias', 'last_7_days'], ['ultimos siete dias', 'last_7_days'], ['ultimos 30 dias', 'last_30_days'], ['ultimos treinta dias', 'last_30_days'],
  ['la semana pasada', 'last_week'], ['semana pasada', 'last_week'], ['esta semana', 'this_week'],
  ['el mes pasado', 'last_month'], ['mes pasado', 'last_month'], ['este mes', 'this_month'],
  ['el ano pasado', 'last_year'], ['ano pasado', 'last_year'], ['este ano', 'this_year'],
  ['desde siempre', 'all'], ['todo el tiempo', 'all'], ['siempre', 'all'], ['hoy', 'today'], ['ayer', 'yesterday'],
  ['last 7 days', 'last_7_days'], ['past 7 days', 'last_7_days'], ['past week', 'last_7_days'], ['last 30 days', 'last_30_days'], ['past 30 days', 'last_30_days'],
  ['last week', 'last_week'], ['this week', 'this_week'], ['last month', 'last_month'], ['this month', 'this_month'],
  ['last year', 'last_year'], ['this year', 'this_year'], ['all time', 'all'], ['ever', 'all'], ['today', 'today'], ['yesterday', 'yesterday'],
];
const INTENT_WORDS: readonly (readonly [string, PlanIntent])[] = [
  ['aves que me interesan', 'wishlist'], ['birds of interest', 'wishlist'], ['me interesan', 'wishlist'], ['de interes', 'wishlist'], ['of interest', 'wishlist'], ['wishlist', 'wishlist'], ['interes', 'wishlist'],
  ['observaciones', 'observations'], ['observacion', 'observations'], ['observations', 'observations'], ['aves vistas', 'observations'],
  ['colecciones', 'collections'], ['coleccion', 'collections'], ['collections', 'collections'],
  ['salidas', 'outings'], ['salida', 'outings'], ['outings', 'outings'],
  ['especies', 'species'], ['species', 'species'],
  ['registros', 'detections'], ['cantos', 'detections'], ['detecciones', 'detections'], ['records', 'detections'], ['songs', 'detections'], ['detections', 'detections'],
];
const PENDING_WORDS = ['por verificar', 'sin revisar', 'provisionales', 'provisional', 'pendientes', 'to verify', 'unreviewed', 'pending'];
const ALL_REVIEW_WORDS = ['todos los estados', 'todos', 'todas', 'all of them', 'every state'];
const COMPARE_WORDS = ['compara', 'comparar', 'compare', 'frente a', 'versus', 'contra', 'vs', 'against', 'compared with', 'compared to'];
const MORE_WORDS = ['ver mas', 'mostrar mas', 'mas resultados', 'siguientes', 'mas', 'show more', 'more', 'next'];
const RESET_WORDS = ['nueva consulta', 'empezar de nuevo', 'borrar', 'new query', 'start over', 'clear'];
const OPEN_WORDS = ['abre', 'abrir', 'abreme', 'open', 'ver el', 'ver la', 'show the'];
const ORDINALS: readonly (readonly [string, number])[] = [
  ['primero', 0], ['primera', 0], ['primer', 0], ['first', 0], ['1', 0], ['segundo', 1], ['segunda', 1], ['second', 1], ['2', 1],
  ['tercero', 2], ['tercera', 2], ['third', 2], ['3', 2], ['cuarto', 3], ['cuarta', 3], ['fourth', 3], ['4', 3], ['quinto', 4], ['quinta', 4], ['fifth', 4], ['5', 4],
  ['ultimo', -1], ['ultima', -1], ['last one', -1], ['last', -1],
];
/** Words that carry no request of their own in a short question, in both languages. */
const FILLER = new Set(('y e o u de del la las el los lo mis mi me muestra muestrame mostrar ensename ensena ver quiero que cuales cuantos cuantas hay tengo ' +
  'en a al por favor solo solamente con para sobre un una unos unas ahora entonces pues bueno dame lista listar hice oi escuche vi mire ' +
  'and the my me show list give what which how many did i hear heard see saw only just with in on of for from please now then a an any have do are is there me').split(' '));

export function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Removes a whole phrase from the text when it is there, reporting whether it was. */
function take(state: { text: string }, phrase: string): boolean {
  const pattern = new RegExp(`(^| )${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`, 'u');
  if (!pattern.test(state.text)) return false;
  state.text = state.text.replace(pattern, ' ').replace(/ +/g, ' ').trim();
  return true;
}

/** The single species whose full name is written in the text, or undefined when none or more than one is. */
function speciesIn(state: { text: string }, names: NameTable | null): string | null | undefined {
  if (!names) return null;
  let best: { readonly species: string; readonly phrase: string } | null = null;
  let tie = false;
  for (const [scientific, common] of Object.entries(names)) {
    for (const name of [scientific, ...common]) {
      const phrase = normalize(name);
      if (!phrase || !` ${state.text} `.includes(` ${phrase} `)) continue;
      if (!best || phrase.length > best.phrase.length) { best = { species: scientific, phrase }; tie = false; }
      else if (phrase.length === best.phrase.length && best.species !== scientific) tie = true;
    }
  }
  if (!best) return null;
  if (tie) return undefined;
  take(state, best.phrase);
  return best.species;
}

function relative(value: RelativePeriod | 'all'): PlanPeriod {
  return value === 'all' ? { kind: 'all' } : { kind: 'relative', value };
}

/** Reads a message against the plan on screen, if any; `names` is the catalogue, once loaded. */
export function followUp(message: string, context: ReadPlan | null, names: NameTable | null): FollowUp {
  const state = { text: normalize(message) };
  if (!state.text) return { kind: 'model' };
  if (RESET_WORDS.some((word) => state.text === word)) return { kind: 'reset' };
  if (MORE_WORDS.some((word) => state.text === word)) return { kind: 'more' };
  if (OPEN_WORDS.some((word) => take(state, word))) {
    const ordinal = ORDINALS.find(([word]) => take(state, word));
    const rest = state.text.split(' ').filter((word) => word && !FILLER.has(word));
    return ordinal && !rest.length ? { kind: 'open', index: ordinal[1] } : { kind: 'model' };
  }

  // Every marker is taken out ("compara … contra …"), so none is left over as an unknown word.
  const compare = COMPARE_WORDS.map((word) => take(state, word)).some(Boolean);
  const periods: PlanPeriod[] = [];
  // Ordered by where they are written, so "this week against last week" keeps its order.
  const found = PERIODS.flatMap(([phrase, value]) => {
    const at = ` ${state.text} `.indexOf(` ${phrase} `);
    return at < 0 ? [] : [{ phrase, value, at }];
  }).sort((left, right) => left.at - right.at || right.phrase.length - left.phrase.length);
  for (const entry of found) if (take(state, entry.phrase)) periods.push(relative(entry.value));
  const intent = INTENT_WORDS.find(([word]) => take(state, word))?.[1] ?? null;
  const pending = PENDING_WORDS.some((word) => take(state, word));
  const everyState = !pending && ALL_REVIEW_WORDS.some((word) => take(state, word));
  const species = speciesIn(state, names);
  if (species === undefined) return { kind: 'model' };
  const rest = state.text.split(' ').filter((word) => word && !FILLER.has(word));
  if (rest.length) return { kind: 'model' };
  if (!compare && !intent && !periods.length && !pending && !everyState && !species) return { kind: 'model' };

  let next: ReadPlan;
  if (compare) {
    // Two periods written, or the one on screen against the one written.
    const [first, second] = periods.length >= 2 ? periods : [context?.period, periods[0]];
    if (!first || !second || first.kind === 'all' || second.kind === 'all') return { kind: 'model' };
    next = plan('compare', { species: species ?? (intent ? null : context?.species ?? null), period: first, compare_period: second });
  } else {
    const base = intent ? plan(intent) : context;
    if (!base || periods.length > 1) return { kind: 'model' };
    const keepsPeriod = base.intent !== 'compare';
    next = {
      ...base,
      intent: base.intent === 'compare' && !intent ? 'detections' : base.intent,
      species: species ?? base.species,
      period: periods[0] ?? (keepsPeriod ? base.period : { kind: 'all' }),
      review: pending ? 'pending' : everyState ? 'all' : base.review,
      compare_period: null,
    };
  }
  const checked = validPlan(next);
  return checked ? { kind: 'plan', plan: checked } : { kind: 'model' };
}
