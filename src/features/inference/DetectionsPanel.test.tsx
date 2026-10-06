import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DetectionsPanel } from './DetectionsPanel';
import { I18nProvider } from '../../i18n';
import type { ClassifiedDetection } from './detectionPolicy';

const candidate: ClassifiedDetection = {
  classIndex: 0, scientificName: 'Turdus fuscater', commonName: 'Great Thrush',
  label: 'Turdus fuscater_Great Thrush', confidence: 0.89, status: 'confirmed_local',
};

describe('DetectionsPanel', () => {
  it('shows confidence and both verification states without presenting certainty', () => {
    render(<DetectionsPanel detections={[candidate, { ...candidate, classIndex: 1, confidence: 0.6, status: 'provisional' }]} />);
    expect(screen.getByText(/89,0\s*%/)).toBeInTheDocument();
    expect(screen.getByText(/confirmada por el modelo local/i)).toBeInTheDocument();
    expect(screen.getByText(/provisional, sin verificar en la nube/i)).toBeInTheDocument();
    expect(screen.getByText(/requiere confirmación/i)).toBeInTheDocument();
  });

  it('communicates empty results without claiming that birds are absent', () => {
    render(<DetectionsPanel detections={[]} />);
    expect(screen.getByText(/esto no indica ausencia de aves/i)).toBeInTheDocument();
  });

  it('does not round near-one probabilities to absolute certainty', () => {
    render(<DetectionsPanel detections={[{ ...candidate, confidence: 0.99999 }]} />);
    expect(screen.getByText(/≥\s*99,9\s*%/)).toBeInTheDocument();
    expect(screen.queryByText(/100\s*%/)).not.toBeInTheDocument();
  });

  it('uses the active language for verification labels', () => {
    localStorage.setItem('birdnet_settings', JSON.stringify({ locale: 'en' }));
    render(<I18nProvider><DetectionsPanel detections={[candidate]} /></I18nProvider>);
    expect(screen.getByText(/confirmed by the local model/i)).toBeInTheDocument();
    localStorage.clear();
  });
});
