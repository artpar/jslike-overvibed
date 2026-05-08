import { describe, it, expect } from 'vitest';
import { createEnvironment, execute } from '../src/index.js';

describe('interpreted function toString', () => {
  it('returns source for arrow functions instead of the interpreter wrapper', async () => {
    const code = "const run = () => {\n  return 1;\n};\nrun.toString();";

    const result = await execute(code, createEnvironment());

    expect(result).toBe("() => {\n  return 1;\n}");
    expect(result).not.toContain('callUserFunction');
  });

  it('returns source for function declarations', async () => {
    const code = "function add(a, b) {\n  return a + b;\n}\nadd.toString();";

    const result = await execute(code, createEnvironment());

    expect(result).toBe("function add(a, b) {\n  return a + b;\n}");
  });

  it('returns source for async function expressions', async () => {
    const code = "const load = async function namedLoad() {\n  return await Promise.resolve(3);\n};\nload.toString();";

    const result = await execute(code, createEnvironment());

    expect(result).toBe("async function namedLoad() {\n  return await Promise.resolve(3);\n}");
  });

  it('preserves function metadata and closure behavior after installing toString', async () => {
    const result = await execute(`
      const scoped = 41;
      const run = () => scoped + 1;
      const source = run.toString();
      ({
        source,
        value: run(),
        hasMetadata: !!run.__metadata,
        hasClosure: !!run.__metadata.closure,
        toStringEnumerable: Object.prototype.propertyIsEnumerable.call(run, 'toString')
      })
    `, createEnvironment());

    expect(result.source).toBe('() => scoped + 1');
    expect(result.value).toBe(42);
    expect(result.hasMetadata).toBe(true);
    expect(result.hasClosure).toBe(true);
    expect(result.toStringEnumerable).toBe(false);
  });

  it('returns module-local source for imported interpreted functions', async () => {
    const moduleResolver = {
      async resolve(modulePath) {
        if (modulePath === 'dep.js') {
          return {
            path: 'dep.js',
            code: "export function run() {\n  return 7;\n}"
          };
        }
        return null;
      }
    };

    const result = await execute(
      'import { run } from "dep.js"; run.toString();',
      createEnvironment(),
      { moduleResolver, sourcePath: 'main.js' }
    );

    expect(result).toBe("function run() {\n  return 7;\n}");
  });
});
