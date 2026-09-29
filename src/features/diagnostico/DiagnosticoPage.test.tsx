import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { DiagnosticoPage } from './DiagnosticoPage';

describe('DiagnosticoPage', () => {
  it('renderiza el título principal y la lista de capacidades', () => {
    render(<DiagnosticoPage />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /diagnóstico de plataforma web/i,
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByText(/aislamiento de origen cruzado/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/soporte de web workers/i)).toBeInTheDocument();
    expect(screen.getByText(/soporte de webassembly/i)).toBeInTheDocument();
  });

  it('permite reevaluar las capacidades e incrementa el contador interactivo', async () => {
    const user = userEvent.setup();
    render(<DiagnosticoPage />);

    const contador = screen.getByTestId('contador-pruebas');
    expect(contador).toHaveTextContent('0');

    const boton = screen.getByRole('button', {
      name: /reevaluar capacidades/i,
    });
    await user.click(boton);

    expect(contador).toHaveTextContent('1');
  });
});
