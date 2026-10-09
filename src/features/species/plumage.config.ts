import type { Plumage } from './plumage';

/**
 * Plates chosen by hand for the birds most often heard in Bogotá, where the photo's background (foliage, sky) or a
 * dark bird would otherwise mislead the automatic choice. Each value names the bird's most telling color, or the
 * slate and brown plates for dark and brown birds. Other species get their plate from their photo.
 */
export const PLUMAGE_OVERRIDES: Readonly<Partial<Record<string, Plumage>>> = Object.freeze({
  'Turdus fuscater': 'mirla', // orange bill and legs on a dark body
  'Turdus ignobilis': 'copeton',
  'Zonotrichia capensis': 'copeton',
  'Colibri coruscans': 'colibri', // violet ear patches
  'Chlorostilbon poortmani': 'esmeralda',
  'Pyrocephalus rubinus': 'escarlata',
  'Ramphocelus dimidiatus': 'escarlata',
  'Thraupis episcopus': 'azulejo',
  'Thraupis palmarum': 'esmeralda',
  'Pheucticus ludovicianus': 'rosado', // rose breast of the male
  'Sicalis flaveola': 'canario',
  'Pitangus sulphuratus': 'canario',
  'Tyrannus melancholicus': 'canario',
  'Troglodytes aedon': 'copeton',
  'Diglossa humeralis': 'pizarra',
  'Coragyps atratus': 'pizarra',
  'Crotophaga ani': 'pizarra',
  'Molothrus bonariensis': 'colibri', // purple sheen of the male
  'Rupornis magnirostris': 'pizarra',
  'Columbina talpacoti': 'mirla',
  'Vanellus chilensis': 'pizarra',
  'Bubulcus ibis': 'pizarra',
});
