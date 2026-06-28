# jslike-overvibed

JavaScript, except every branch has to pass the vibe check.

This is a fork of JSLike where conditionals are no longer cold little truth machines. The interpreter still evaluates the condition, then shows the result to VibeThink and asks:

> should we really go this way?

Sometimes the model agrees with JavaScript. Sometimes it hesitates. Sometimes your binary search becomes a personality test.

## The Bit That Got Haunted

These branch points are model-mediated:

```js
if (condition) {}
while (condition) {}
do {} while (condition)
for (; condition; ) {}
condition ? a : b
```

These are still boring old JavaScript:

```js
a && b
a || b
a ?? b
```

So `x > 5` is still evaluated by JS first. But the final “true branch or false branch?” decision belongs to VibeThink.

## Start The Oracle

Run VibeThink locally:

```sh
.venv/bin/python -m mlx_lm server \
  --model mlx-community/VibeThinker-3B-4bit \
  --host 127.0.0.1 \
  --port 8080 \
  --max-tokens 8096 \
  --temp 0.6 \
  --top-p 0.95
```

`jslike-overvibed` talks to:

```text
http://127.0.0.1:8080/v1/chat/completions
```

It reads the final branch answer from:

```text
choices[0].message.content
```

and keeps the thinking from:

```text
choices[0].message.reasoning
```

## Try The Smallest Bad Idea

```sh
npm install

node --input-type=module -e "import { execute } from './src/index.js'; const result = await execute(\"let out = 'unset'; if (true) { out = 'true'; } else { out = 'false'; } out\"); console.log(result);"
```

With tracing:

```sh
JSLIKE_VIBETHINK_TRACE=1 node --input-type=module -e "import { execute } from './src/index.js'; await execute(\"if (true) { 'yes' } else { 'no' }\");"
```

You should see something like:

```text
[vibethink:condition] {"source":"true","value":"true","jsTruthiness":true,"token":"T","chosenBranch":true}
```

That line is the whole artifact. The program reached a branch. JavaScript said one thing. The model blessed or rejected it.

## Binary Search, But It Has To Believe

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

A clean run looks like this:

```text
lo <= hi       JS=true   VibeThink=T   continue
value === target JS=false VibeThink=F  keep looking
value < target   JS=true  VibeThink=T  go right
value === target JS=true  VibeThink=T  found it
```

If the model drifts, the algorithm drifts. That is not a bug in the experiment. That is the experiment.

## Trace Entries

Each traced condition can include:

```js
{
  source: "value < target",
  value: true,
  valueText: "true",
  jsTruthiness: true,
  token: "T",
  raw: "true",
  reasoning: "The evaluated JavaScript value is true...",
  chosenBranch: true
}
```

Use an array:

```js
const trace = [];
await execute(code, null, { vibethinkConditionLog: trace });
```

Or stream JSON lines:

```sh
JSLIKE_VIBETHINK_TRACE=1 node your-program.js
```

## Knobs

```js
await execute(code, null, {
  vibethinkConditionals: true,
  vibethinkEndpoint: 'http://127.0.0.1:8080/v1/chat/completions',
  vibethinkMaxTokens: 256,
  vibethinkConditionLog: []
});
```

Environment equivalents:

```sh
JSLIKE_VIBETHINK_CONDITIONALS=0
JSLIKE_VIBETHINK_ENDPOINT=http://127.0.0.1:8080/v1/chat/completions
JSLIKE_VIBETHINK_MODEL=default_model
JSLIKE_VIBETHINK_MAX_TOKENS=256
JSLIKE_VIBETHINK_TRACE=1
```

## What This Enables

Not reliability.

It enables software that can reach a fork in execution and consult a local model’s sense of the situation. Programs become probes. Algorithms become interviews. A branch is no longer just a boolean gate; it is a tiny judgment call.

This is JavaScript with the certainty removed at exactly one place.

## Escape Hatch

If you need normal JavaScript behavior:

```sh
JSLIKE_VIBETHINK_CONDITIONALS=0 npm test
```

Or:

```js
await execute(code, null, { vibethinkConditionals: false });
```

Sync interpreter calls cannot use VibeThink conditionals. Use `execute()`, which switches to async evaluation when the branch oracle is enabled.

