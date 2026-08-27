/* ============================================================================
 * domtomd.js — the inverse of renderers.js: DRAW the rendered DOM back into
 * markdown text.
 * ----------------------------------------------------------------------------
 * md-format normally flows markdown → parse → AST → rendered output. But the
 * live editor (index.html) wants BIDIRECTIONAL editing: when you type straight
 * into the rendered preview (a WYSIWYG surface), the browser edits real HTML
 * elements. That HTML is OUR own renderer's output (plus whatever the browser
 * does to it while you type), so we can walk it back to markdown and write that
 * into the source editor.
 *
 * This is deliberately a plain DOM walk — no framework, no virtual dom. It
 * mirrors the shapes that renderHtml() emits in renderers.js, so those two
 * files are designed to stay in step:
 *
 *   h1..h6 → #/##/###       strong/em/del → ** / * / ~~ markers
 *   p      → plain text     code (inline)  → `tick`      pre → ```fence```
 *   a      → [text](href)   img            → ![alt](src)
 *   ul/ol  → - / 1. markers li             → + checkbox if task
 *   blockquote → > lines    hr             → ---          br → "  " hard break
 *
 * Why is this in its own file and not stuck in index.html? Two reasons: it's
 * the third leg of the engine (md→out, out→md, inspect) so it deserves to be a
 * testable module, and it keeps the page file readable. It's meant to be used
 * in a browser only (it touches the DOM), so no node-import guarantees.
 * ========================================================================== */

/* block-level node → markdown string; `depth` = list nesting level. */
function mdBlock(node, depth) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const tag = node.tagName.toLowerCase();
    switch (tag) {

        case "h1": case "h2": case "h3": case "h4": case "h5": case "h6":
            return `${"#".repeat(+tag[1])} ${mdInlineChildren(node)}`;

        /* `div` is what browsers inject when you hit Enter inside a
         * contenteditable paragraph — treat it like a paragraph. */
        case "p":
        case "div":
            return mdInlineChildren(node);

        case "blockquote": {
            const inner = mdBlockChildren(node, depth).join("\n\n");
            return inner.split("\n").map(line => `> ${line || ">"}`).join("\n");
        }

        case "ul":
        case "ol":
            return mdList(node, depth);

        case "pre":
            return mdPre(node);

        case "hr":
            return "---";
    }
    return mdInline(node);   // anything else → treat as inline text
}

/* --- lists: `- ` for unordered, `1. ` for ordered (keeping the start number) */
function mdList(list, depth) {
    const ordered = list.tagName.toLowerCase() === "ol";
    const start = parseInt(list.getAttribute("start") || "1", 10);
    let n = start;
    const out = [];
    for (const li of list.children) {
        if (li.tagName.toLowerCase() !== "li") continue;
        out.push(mdListItem(li, depth, ordered ? n++ : null));
    }
    return out.join("\n");
}

function mdListItem(li, depth, num) {
    const indent = "  ".repeat(depth);
    const marker = num !== null ? `${num}. ` : "- ";

    /* our renderer emits task items as <li><input type="checkbox"…> <p>… -->
     * read the live checked state so toggling a box in the UI lands in source */
    let task = "";
    const first = li.firstElementChild;
    if (first && first.tagName === "INPUT" && (first.type === "checkbox")) {
        task = first.checked ? "[x] " : "[ ] ";
    }

    /* build the item's content: paragraphs, bare text and nested lists. The
     * first piece rides on the marker line, everything after is indented so
     * the sequence still parses back as one list item. */
    const lines = [];
    let placedMarker = false;
    for (const child of li.childNodes) {
        if (child.nodeType === Node.TEXT_NODE && !child.textContent.trim()) continue;
        if (child === first && child.tagName === "INPUT") continue;

        const nested = child.nodeType === Node.ELEMENT_NODE &&
            (child.tagName === "UL" || child.tagName === "OL");
        const piece = nested ? mdList(child, depth + 1) : mdBlock(child, depth + 1);

        for (const line of piece.split("\n")) {
            if (!placedMarker) {
                /* an EMPTY first block must never own the marker line —
                 * contenteditable loves injecting a bare <div>/<p> into a task
                 * item on toggle/edit, and that pushed the real text onto an
                 * indented new line ("- [x]\n  open task") instead of the
                 * canonical single line ("- [x] open task"). Skip it. */
                if (!line.trim()) continue;
                lines.push(indent + marker + task + line);
                placedMarker = true;
            } else {
                lines.push(indent + "  " + line);
            }
        }
    }
    if (!placedMarker) lines.push(indent + marker + task);

    return lines.join("\n");
}

/* --- fenced code block: steal the language off class="language-js" --------- */
function mdPre(node) {
    const code = node.querySelector("code");
    const text = (code || node).textContent || "";
    const cls = code ? code.getAttribute("class") || "" : "";
    const m = /language-([\w+#.\-]+)/.exec(cls);
    const lang = m ? m[1] : "";
    const fence = text.includes("```") ? "~~~~" : "```";   // never collide
    return `${fence}${lang ? " " + lang : ""}\n${text}\n${fence}`;
}

/* --- inline serialisation: turn element/Text children into markdown --------- */
function mdInline(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const tag = node.tagName.toLowerCase();
    switch (tag) {
        case "br":         return "  \n";                    // hard line break
        case "strong": case "b":  return `**${mdInlineChildren(node)}**`;
        case "em":    case "i":  return `*${mdInlineChildren(node)}*`;
        case "del":   case "s":  return `~~${mdInlineChildren(node)}~~`;
        case "code":
            return "`" + node.textContent.replace(/`/g, "\\`") + "`";
        case "a": {
            const href = node.getAttribute("href") || "";
            const title = node.getAttribute("title");
            const label = mdInlineChildren(node) || href;
            /* a bare URL in the source comes out of the renderer as
             * <a href="https://x.y">https://x.y</a>. Writing that back as
             * [https://x.y](https://x.y) would DOUBLE the URL on every round
             * trip — any interaction in the editor would "duplicate links".
             * If the label IS the href, write it back as a plain URL. */
            if (label === href && !title && /^(https?:|www\.)/i.test(href)) return label;
            return `[${label}](${href}${title ? ` "${title}"` : ""})`;
        }
        case "img": {
            const src = node.getAttribute("src") || "";
            const alt = node.getAttribute("alt") || "";
            const title = node.getAttribute("title");
            return `![${alt}](${src}${title ? ` "${title}"` : ""})`;
        }
        /* spans (incl. the caret markers), unknown tags → just their text */
        default:
            return mdInlineChildren(node);
    }
}

function mdInlineChildren(el) {
    return Array.from(el.childNodes).map(mdInline).join("");
}

function mdBlockChildren(el, depth) {
    return Array.from(el.childNodes)
        .filter(n => n.nodeType !== Node.TEXT_NODE || n.textContent.trim())
        .map(n => mdBlock(n, depth));
}

/** domToMarkdown(container) — the one entry point. Feed it the rendered root
 * (the `.md` div) and get the whole document as markdown text. */
export function domToMarkdown(container) {
    return Array.from(container.childNodes)
        .filter(n => n.nodeType !== Node.TEXT_NODE || n.textContent.trim())
        .map(n => mdBlock(n, 0))
        .filter(s => s.length)
        .join("\n\n");
}