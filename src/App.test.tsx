import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from './App';

describe('App', () => {
  it('renderiza la página de diagnóstico correctamente', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /diagnóstico de plataforma web/i,
      }),
    ).toBeInTheDocument();
  });
});
