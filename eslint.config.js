const tsParser = require('@typescript-eslint/parser');
const importPlugin = require('eslint-plugin-import');

function zone(target, from) {
  return {
    target: `./src/${target}/**/*`,
    from: from.map((f) => `./src/${f}/**/*`),
  };
}

module.exports = [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { sourceType: 'module' },
    },
    plugins: { import: importPlugin },
    settings: {
      'import/resolver': { typescript: true, node: true },
    },
    rules: {
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            // core depends on nothing else in src/
            zone('core', ['graph', 'scorer', 'planner', 'analysis', 'retrieval', 'renderer', 'ai']),
            // graph depends on core only
            zone('graph', ['analysis', 'retrieval', 'scorer', 'planner', 'renderer', 'ai']),
            // scorer depends on core only
            zone('scorer', ['graph', 'analysis', 'retrieval', 'planner', 'renderer', 'ai']),
            // planner depends on core + scorer, NEVER analysis/retrieval/graph (ADR-006)
            zone('planner', ['analysis', 'retrieval', 'graph', 'renderer', 'ai']),
            // analysis depends on core only
            zone('analysis', ['graph', 'scorer', 'planner', 'retrieval', 'renderer', 'ai']),
            // retrieval depends on core + analysis outputs
            zone('retrieval', ['graph', 'scorer', 'planner', 'renderer', 'ai']),
            // renderer depends on core + graph, NEVER planner internals
            zone('renderer', ['scorer', 'planner', 'analysis', 'retrieval', 'ai']),
            // ai depends on core only
            zone('ai', ['graph', 'scorer', 'planner', 'analysis', 'retrieval', 'renderer']),
          ],
        },
      ],
    },
  },
];
