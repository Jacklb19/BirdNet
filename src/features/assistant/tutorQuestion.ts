import { normalize, type NameTable } from './followUp';
import type { TutorTopic } from './types';

interface PublicTopic { readonly topic: TutorTopic; readonly species: string | null }

/** Route explicit public questions locally; the existing tutor validates their scope before answering. */
export function tutorQuestion(text: string, names: NameTable | null): PublicTopic | null {
  const words = normalize(text);
  if (!/^(que |como |por que |explica|cuentame |hablame |what |how |why |explain |tell me )/u.test(words)) return null;
  if (/\b(mis|my|our|nuestros)\b/u.test(words) && /\b(registros|records|salidas|outings|colecciones|collections|cantos|songs)\b/u.test(words)) return null;
  const topics: readonly (readonly [RegExp, TutorTopic])[] = [
    [/\b(confianza|confidence)\b/u, 'confidence'],
    [/\b(estados?|status|states)\b/u, 'detection_status'],
    [/\b(audio|grabaciones|recordings)\b/u, 'recording_privacy'],
    [/\b(ubicacion|location|gps|coordenadas|coordinates)\b/u, 'approximate_location'],
  ];
  // Prefer an explicitly named bird, so "what is the conservation status of ..." uses public species facts.
  const matches = new Set<string>();
  for (const [species, common] of Object.entries(names ?? {})) {
    if ([species, ...common].some((name) => name && ` ${words} `.includes(` ${normalize(name)} `))) matches.add(species);
  }
  if (matches.size > 1) return null;
  const species = matches.values().next().value;
  if (species) return { topic: 'species_facts', species };
  const topic = topics.find(([pattern]) => pattern.test(words))?.[1];
  return topic ? { topic, species: null } : null;
}
