# Experiments

`jslike-overvibed` is most interesting when the condition value carries meaning beyond JavaScript truthiness.

## Binary Search

With the chat endpoint and enough model tokens, binary search completed cleanly:

```text
lo <= hi              JS=true   VibeThink=T
value === target      JS=false  VibeThink=F
value < target        JS=true   VibeThink=T
lo <= hi              JS=true   VibeThink=T
value === target      JS=true   VibeThink=T
found >= 0            JS=true   VibeThink=T
```

Result:

```json
{ "found": 5, "value": 11, "guard": 2 }
```

Takeaway: classical algorithms are consistency tests. When VibeThink agrees with evaluated comparisons, the algorithm behaves normally. If it drifts, the algorithm drifts.

## Fraud Policy

Program shape:

```js
if (unusualAmount || unusualHour || riskyHistory || riskyCountry) {
  review();
} else {
  approve();
}
```

Observed run:

```text
a: risk condition JS=false, VibeThink=F -> approve
b: risk condition JS=true,  VibeThink=T -> review
c: risk condition JS=true,  VibeThink=T -> review
d: risk condition JS=false, VibeThink=F -> approve
e: risk condition JS=true,  VibeThink=T -> review
```

Takeaway: this behaved like a faithful boolean confirmer. The model saw an already-evaluated risk condition and agreed with JavaScript at every branch.

## Better Probe: Semantic Truthiness

The sharper test is to give JavaScript a value that is truthy for boring reasons, but meaningful to the model:

```js
const approveApplicant = "Applicant has unstable income, high debt, and prior defaults.";

if (approveApplicant) {
  approve();
} else {
  deny();
}
```

JavaScript sees a non-empty string, so it would always take the true branch. VibeThink sees the string content and can reject the branch. This tests model judgment rather than boolean confirmation.

Observed applicant run:

```js
const approveAlice = "Approve Alice: stable income, low debt, no defaults, long employment history.";
const approveBlake = "Approve Blake: unstable income, high debt, two prior defaults, recently changed jobs.";
const approveCasey = "Approve Casey: excellent credit score, moderate income, one late payment three years ago.";
const approveDevon = "Approve Devon: no income documentation, requested maximum loan, active collections account.";
```

Trace summary:

```text
Alice  JS=true  VibeThink=T  -> approve
Blake  JS=true  VibeThink=F  -> deny
Casey  JS=true  VibeThink=T  -> approve
Devon  JS=true  VibeThink=T  -> approve
```

Takeaway: this is the first clearly interesting behavior. Every condition was a non-empty string, so JavaScript would approve all four. VibeThink rejected Blake because the string itself described high risk. It still approved Devon despite no income documentation and active collections, which is a useful drift/anomaly to inspect rather than a runtime error.

This test shows the difference between:

- JavaScript truthiness: "is the string non-empty?"
- Model-mediated branching: "does this sentence deserve the true branch?"
