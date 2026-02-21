# What Does a Browser Do?

A browser turns a URL and a stream of bytes into an interactive document. The simplified pipeline in this book is:

1. Fetch the document.
2. Parse HTML into a DOM tree.
3. Parse CSS into style rules.
4. Match styles and build a render tree.
5. Calculate layout boxes.
6. Paint pixels to the screen.

Real browsers are much more sophisticated, but this model gives us a useful learning path. We will favor small, testable pieces over completeness.

```ts filename="pipeline.ts" highlight="2-4"
export type BrowserPipeline = [
  "HTML",
  "DOM",
  "CSSOM",
  "RenderTree",
  "Layout",
  "Paint"
];
```

> The goal is not to clone Chrome. The goal is to understand the pressure points that shape browser architecture.
