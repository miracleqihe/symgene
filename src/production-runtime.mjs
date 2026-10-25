import configuration from './production-runtime.json' with { type: 'json' };

// The public entry must fail closed if an adoption switch is introduced without
// a separately authorized production integration. This is executed at startup.
export function assertLegacyProductionRuntime(config = configuration) {
  if (config.contentMode !== 'legacy' || config.legacySeed !== 'src/content/knowledge.json'
    || config.signedGateway !== null || config.formalT02Adoption !== false
    || config.developmentConsumers !== 'explicit-opt-in-only') {
    throw Object.assign(new Error('PRODUCTION_RUNTIME_NOT_LEGACY'), { code: 'PRODUCTION_RUNTIME_NOT_LEGACY' });
  }
  const runtime = Object.freeze({ ...config });
  // An immutable receipt lets executable production checks confirm that the
  // shipped entry actually ran this assertion, with the expected configuration.
  if (typeof document !== 'undefined') Object.defineProperty(globalThis, '__SYMGENE_PRODUCTION_RUNTIME__',
    { value: runtime, writable: false, configurable: false });
  return runtime;
}
