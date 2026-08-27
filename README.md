# md-format

**md-format** is a from-scratch markdown parser + multi-format renderer, built
to solve one very specific annoyance: dumping AI-generated text that *technically*
contains markdown — `**bold**`, `#headings`, `1. lists` — but
shows up as raw asterisks and hashes. Paste it in, get it **formatted nicely**.

Zero dependencies. Pure ES modules. Runs in the browser, node, web workers —
anywhere JS can `import`.

```
              ┌─────────────┐      ┌─────────────┐
   markdown → │  mdparser   │  →   │  renderers  │ → html / text / ansi / markdown
   text     → │ (text→tree) │  →   │ (tree→text) │
              └─────────────┘      └─────────────┘
```

The split is deliberate: parsing *understands* the text (turns it into an
object tree — the **AST**), rendering *draws* it. One parse, four outputs.
And because the parser is separate, the AI-text forgiving bits (see **What's
supported**) stay in one place instead of being patched onto string output.

---

## Try it

```bash
python3 -m http.server 8000     # from this repo, then open :8000
```

- **`index.html`** — the live editor: split / **markdown-only** / **preview-only**
  views, sync scroll, dark mode, output switcher, AST inspector, export. In HTML
  preview mode the rendered document is **bidirectionally editable** — type
  straight into the rendered output (WYSIWYG) and your keystrokes are folded
  back into the markdown source; task checkboxes are clickable; the caret is
  restored to the exact spot after every round-trip.
- **`test.html`** — the test harness: 29 locked-in parsing cases, run green or you'll
  know about it.

## Use it as an API — invoke from anywhere

The library is two sibling modules and both are TS-free, DOM-free ES modules, so
they can be imported from **anywhere** — no build step, no bundler.

### From your own code (npm-less, no install)

```js
import { format } from "../tools/md-format/renderers.js";
const html = format(text, "html");        // "<h1>Title</h1> ..."
```

### Straight from this repo, over the internet

Because this repo is public, [jsDelivr](https://www.jsdelivr.com/) serves it as a
CDN right now (verified: files get `Access-Control-Allow-Origin: *` and the
correct module MIME type — which is everything a browser's module loader needs):

```js
import { format } from "https://cdn.jsdelivr.net/gh/AIGsniperYt/md-format@main/renderers.js";

// in a browser: works in <script type="module">, web workers, import maps...
const html = format("# Hello **world**", "html");
```

> **Pin a version before you depend on it in production.** `@main` points at the
> `main` branch which moves on every push — swap it for a version tag once you
> ship one (`@v0.1.0`), and jsDelivr will serve that tag immutably.

> **A true remote *HTTP* API** (`curl -d '# hi' https://… → <h1>hi</h1>`) is a
> different beast: that needs a tiny serverless wrapper (Cloudflare Worker /
> Vercel Function). GitHub Pages is static-only so it can't host that here. The
> library being a pure module usually means you don't need a server at all —
> but the wrapper is ~30 lines if you ever do.

## API

### `format(text, type = "html") → string`

The one-liner. Parse + render in a single call.

| type        | output                                                            |
| ----------- | ----------------------------------------------------------------- |
| `"html"`    | the pretty one — github-markdown-flavoured `<h1>`, `<strong>`…    |
| `"text"`    | formatting stripped, links become `label (url)`                   |
| `"ansi"`    | terminal escape codes for bold / italic / colour                  |
| `"markdown"`| a normalised round-trip of the source, good for "clean up " mess   |

```js
format("# Hi **there**", "html");     // '<h1>Hi <strong>there</strong></h1>'
format("# Hi **there**", "text");     // 'Hi there'
format("# Hi **there**", "ansi");     // '\u001b[1m\u001b[36mHi there\u001b[0m'
format("#  Hi **there**  ", "markdown"); // '# Hi **there**'  (normalised)
```

### The two-step (when you want to keep the tree)

```js
import { parse } from "./mdparser.js";
import { render } from "./renderers.js";

const tree = parse(source);      // inspect it, mutate it, debug it…
render(tree, "html");            // …then draw it, however many ways you like
```

`parse(text)` returns a `{ type: "document", children: [...] }` tree. Every node
shape is documented in the header comment of `mdparser.js` (heads-up if you add
a node type: every renderer must handle it).

## What's supported

- **Blocks:** atx headings (`#title`, no space — we're forgiving on purpose),
  setext headings (`Title` + `===`), fenced code (```` ```lang ````), indented
  code, blockquotes, ordered/unordered/nested lists, task lists (`- [x] done`),
  horizontal rules, paragraphs with soft & hard (`two-spaces`) breaks.
- **Inlines:** `**bold**`, `*italic*`, `___both___`-style combos with **parallel
  nesting** (`*italics with **bold** inside*` resolves cleanly, matching
  CommonMark parsers), `~~strikethrough~~`, inline code, links `[x](url "title")`,
  `<https://autolinks>` and *bare* URLs (`a raw https://… in a sentence`),
  images, backslash escapes, raw-HTML passthrough.
- **Deviation from CommonMark:** we skip the Recipe-for-Doom delimiter stack.
  Our two-pass closer (exact-run-first) handles the 95% case *and* the usual
  nesting patterns; truly pathological spacing can still surprise. It's the
  price of leaving the parser human-readable.

## Test harness

`test.html` asserts against exact output strings — the parser's behaviour is
frozen until you deliberately change it. Run it any time before shipping.

## Files

```
mdparser.js   the parser:   markdown text  →  AST          (the thinky half)
renderers.js  the renderer: AST → html/text/ansi/markdown   (the drawy half)
domtomd.js    the inverse:  rendered DOM   →  markdown text (WYSIWYG half)
index.html    the live editor: split / markdown / preview views + edit-in-preview
test.html     assertions over the parser & renderers
```

## License

Copyright © 2026 AIGsniper. All Rights Reserved — see the [portfolio
repo](https://github.com/AIGsniperYt/aigsniperyt.github.io) for the full terms.
(In short: publicly viewable, but don't copy this code into your own projects
without asking.)