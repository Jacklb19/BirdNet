import { expect, it } from 'vitest';
import { tutorQuestion } from './tutorQuestion';

const names = { 'Turdus fuscater': ['Mirlo grande', 'Great Thrush'] };

it('routes public questions without sending an interpretation request first', () => {
  expect(tutorQuestion('¿Qué significa la confianza del 80 %?', names)).toEqual({ topic: 'confidence', species: null });
  expect(tutorQuestion('How exact is the location?', names)).toEqual({ topic: 'approximate_location', species: null });
  expect(tutorQuestion('Cuéntame sobre el mirlo grande', names)).toEqual({ topic: 'species_facts', species: 'Turdus fuscater' });
  expect(tutorQuestion('What is the conservation status of the Great Thrush?', names)).toEqual({ topic: 'species_facts', species: 'Turdus fuscater' });
});

it('leaves private queries and ambiguous or unknown species to the query interpreter', () => {
  expect(tutorQuestion('¿Qué confianza tienen mis registros?', names)).toBeNull();
  expect(tutorQuestion('Tell me about the unknown bird', names)).toBeNull();
  expect(tutorQuestion('Tell me about the Great Thrush', { ...names, 'Turdus flavipes': ['Mirlo azulado', 'Great Thrush'] })).toBeNull();
});
