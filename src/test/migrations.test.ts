import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Migraciones de Supabase - Cobertura de RLS', () => {
  const migrationsDir = path.resolve(process.cwd(), 'supabase', 'migrations');

  it('debe existir el directorio de migraciones y contener al menos un archivo .sql', () => {
    expect(fs.existsSync(migrationsDir)).toBe(true);
    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'));
    expect(files.length).toBeGreaterThan(0);
  });

  it('cada CREATE TABLE debe tener su correspondiente ENABLE ROW LEVEL SECURITY', () => {
    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'));

    const createdTables: string[] = [];
    const rlsEnabledTables: string[] = [];

    // Expresión regular para detectar tablas creadas:
    // Ej: "create table if not exists public.profiles (" o "create table projects ("
    const createTableRegex =
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s*\(/gi;

    // Expresión regular para detectar habilitación de RLS:
    // Ej: "alter table public.profiles enable row level security;"
    const enableRlsRegex =
      /alter\s+table\s+(?:public\.)?([a-zA-Z0-9_]+)\s+enable\s+row\s+level\s+security\s*;/gi;

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');

      let match: RegExpExecArray | null;

      while ((match = createTableRegex.exec(content)) !== null) {
        const tableName = match[1]?.toLowerCase();
        if (tableName) {
          createdTables.push(tableName);
        }
      }

      while ((match = enableRlsRegex.exec(content)) !== null) {
        const tableName = match[1]?.toLowerCase();
        if (tableName) {
          rlsEnabledTables.push(tableName);
        }
      }
    }

    // Verificar que se detectaron tablas
    expect(createdTables.length).toBeGreaterThan(0);

    // Verificar que todas y cada una de las tablas creadas tienen RLS habilitada
    for (const table of createdTables) {
      expect(
        rlsEnabledTables,
        `La tabla '${table}' fue creada pero no tiene activada Row Level Security (RLS)`,
      ).toContain(table);
    }
  });
});
