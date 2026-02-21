# Tokenizing HTML

The tokenizer reads characters and emits tokens. A production HTML tokenizer has many states, but our learning version starts with three token types:

| Token | Example | Meaning |
| --- | --- | --- |
| StartTag | `<p>` | Open an element |
| EndTag | `</p>` | Close an element |
| Text | `hello` | Add text content |

```ts filename="tokenizer.ts"
type Token =
  | { type: "StartTag"; name: string }
  | { type: "EndTag"; name: string }
  | { type: "Text"; value: string };

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let cursor = 0;

  while (cursor < input.length) {
    cursor += 1;
  }

  return tokens;
}
```

This deliberately incomplete function gives the editor a realistic code-heavy chapter to preview and export.
