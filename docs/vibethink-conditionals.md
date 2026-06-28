# VibeThink Conditionals

This fork delegates branch-test decisions to a local VibeThink model by default.

Start the model server:

```sh
.venv/bin/python -m mlx_lm server \
  --model mlx-community/VibeThinker-3B-4bit \
  --host 127.0.0.1 \
  --port 8080 \
  --max-tokens 1 \
  --temp 0.6 \
  --top-p 0.95
```

Then run a smoke test:

```sh
node --input-type=module -e "import { execute } from './src/index.js'; const result = await execute(\"let out = 'unset'; if (true) { out = 'true'; } else { out = 'false'; } out\"); console.log(result);"
```

By default, JSLike calls `http://127.0.0.1:8080/v1/chat/completions`. VibeThink may put its thinking in `message.reasoning` and the final boolean in `message.content`, so the interpreter parses `message.content` as the branch answer.

Configuration:

- `vibethinkConditionals: false` or `JSLIKE_VIBETHINK_CONDITIONALS=0` disables model conditionals.
- `vibethinkEndpoint` or `JSLIKE_VIBETHINK_ENDPOINT` overrides the endpoint.
- `vibethinkModel` or `JSLIKE_VIBETHINK_MODEL` includes a model in the request body.
- `vibethinkMaxTokens` or `JSLIKE_VIBETHINK_MAX_TOKENS` controls request `max_tokens`; default is `256` so the model can think and still emit final content.
- `vibethinkConditionEvaluator` injects a custom async evaluator for tests.
- `vibethinkConditionTrace: true` or `JSLIKE_VIBETHINK_TRACE=1` logs each model-routed condition to stderr.
- `vibethinkConditionLog: []` collects trace entries programmatically.
- `vibethinkConditionLogger(entry)` receives each trace entry.

Trace entries include the condition source, evaluated JavaScript value, JavaScript truthiness, model token, raw model text, and chosen branch. Example:

```js
import { execute } from './src/index.js';

const trace = [];
const result = await execute(`
  let out = 'unset';
  if (Math.random() > 0.5) {
    out = 'heads';
  } else {
    out = 'tails';
  }
  out
`, null, { vibethinkConditionLog: trace });

console.log({ result, trace });
```

Console tracing prints compact JSON lines:

```sh
JSLIKE_VIBETHINK_TRACE=1 node my-program.js
```

Model-routed condition sites:

- `if` tests
- `while` and `do while` tests
- `for` tests, when present
- ternary condition tests

Logical operators (`&&`, `||`, `??`) keep normal JavaScript short-circuit behavior.
