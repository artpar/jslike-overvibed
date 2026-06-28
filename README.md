# jslike-overvibed

`jslike-overvibed` is a fork of JSLike where branch decisions are delegated to a local VibeThink model.

The interpreter still evaluates each condition expression normally, but before choosing the branch it asks VibeThink whether the condition should take the true path. That makes ordinary JavaScript control flow model-mediated.

## What Is Overvibed

These condition sites go through VibeThink:

- `if`
- `while`
- `do while`
- `for` test expressions
- ternary condition tests

These keep normal JavaScript behavior:

- `&&`
- `||`
- `??`

The model sees both the condition source and the evaluated JavaScript value. The final boolean is extracted from `choices[0].message.content`; VibeThink reasoning is kept for tracing.

## Run VibeThink

```sh
.venv/bin/python -m mlx_lm server \
  --model mlx-community/VibeThinker-3B-4bit \
  --host 127.0.0.1 \
  --port 8080 \
  --max-tokens 8096 \
  --temp 0.6 \
  --top-p 0.95
```

The default endpoint is:

```text
http://127.0.0.1:8080/v1/chat/completions
```

## Try It

```sh
npm install
node --input-type=module -e "import { execute } from './src/index.js'; const result = await execute(\"let out = 'unset'; if (true) { out = 'true'; } else { out = 'false'; } out\"); console.log(result);"
```

Trace every model-routed branch:

```sh
JSLIKE_VIBETHINK_TRACE=1 node --input-type=module -e "import { execute } from './src/index.js'; await execute(\"if (true) { 'yes' } else { 'no' }\");"
```

Example trace:

```text
[vibethink:condition] {"source":"true","value":"true","jsTruthiness":true,"token":"T","chosenBranch":true}
```

## Programmatic Tracing

```js
import { execute } from './src/index.js';

const trace = [];

const result = await execute(`
  const arr = [1, 3, 5, 7, 9, 11, 13, 15];
  const target = 11;
  let lo = 0;
  let hi = arr.length - 1;
  let found = -1;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const value = arr[mid];

    if (value === target) {
      found = mid;
      break;
    } else if (value < target) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  found
`, null, { vibethinkConditionLog: trace });

console.log({ result, trace });
```

Trace entries include:

- `source`
- `value`
- `valueText`
- `jsTruthiness`
- `token`
- `raw`
- `reasoning`
- `chosenBranch`

## Configuration

- `vibethinkConditionals: false` or `JSLIKE_VIBETHINK_CONDITIONALS=0` disables model-mediated branching.
- `vibethinkEndpoint` or `JSLIKE_VIBETHINK_ENDPOINT` overrides the endpoint.
- `vibethinkModel` or `JSLIKE_VIBETHINK_MODEL` includes a model in the request body.
- `vibethinkMaxTokens` or `JSLIKE_VIBETHINK_MAX_TOKENS` controls request `max_tokens`; default is `256`.
- `vibethinkConditionTrace: true` or `JSLIKE_VIBETHINK_TRACE=1` logs trace lines to stderr.
- `vibethinkConditionLog: []` collects trace entries.
- `vibethinkConditionLogger(entry)` receives each trace entry.
- `vibethinkConditionEvaluator` injects a custom async evaluator.

## Behavior Notes

This is intentionally not a reliable JavaScript runtime.

Classical algorithms become probes for model consistency. Binary search, for example, works only if the model consistently agrees with the evaluated comparisons. When it drifts, the algorithm drifts with it.

Sync interpreter calls cannot use VibeThink conditionals. Use `execute()`, which routes execution through the async interpreter when this feature is enabled.

