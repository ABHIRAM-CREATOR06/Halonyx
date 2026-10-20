# Halonyx Interface Design Guide

This document records the visual language currently used by Halonyx. Use it when adding or revising screens so the application remains calm, legible, consistent across themes, and recognizably part of the same product.

## Product character

Halonyx is a private, self-hostable messenger. The interface should feel dependable, direct, and quiet. Conversation content is the primary focus; security and identity controls should be easy to find without competing with messages. The visual direction is a refined monochrome workspace with restrained blue for message actions and selected states.

Use these principles when making UI decisions:

- Prefer clear hierarchy and useful whitespace over decorative elements.
- Keep the chat readable and make the composer easy to locate.
- Use color to communicate state or action, not as decoration.
- Keep security controls visible and understandable; do not imply that an operation is secure unless the existing code actually provides it.
- Make dark and light themes equivalent in structure, contrast, and interaction states.
- Avoid introducing new fonts, gradients, neon accents, shadows, or component styles without a clear product need.

## Visual foundations

### Color and themes

The interface supports `body.theme-dark` and `body.theme-light`. Runtime components should consume the active theme variables rather than hard-code a color for a surface or text. The current effective palette is intentionally close to neutral gray; outgoing message blue is the main saturated accent.

| Purpose | Dark theme | Light theme |
| --- | --- | --- |
| Main canvas (`--bg-ink`) | `#18181b` | `#f4f6f9` |
| Panel (`--bg-panel`) | `#202024` | `#ffffff` |
| Surface (`--bg-surface`) | `#2a2a2f` | `#f7f8fa` |
| Elevated surface (`--bg-elevated`) | `#34343a` | `#eef1f5` |
| Hover surface (`--bg-hover`) | `#303036` | `#edf2f7` |
| Primary text (`--fg`) | `#f6f6f7` | `#182230` |
| Secondary text (`--fg-sub`) | `#d0d0d4` | `#465367` |
| Muted text (`--fg-muted`) | `#9d9da5` | `#65748a` |
| Border (`--bd`) | translucent white | `#e2e7ee` |
| Strong border (`--bd-hi`) | translucent white | `#cbd5e1` |
| Focus ring (`--focus-ring`) | shared blue focus color | `#3478f6` |
| Outgoing message (`--message-blue`) | `#4c8dff` | `#3478f6` |

Theme variables are declared and refined in `frontend/css/style.css`. That stylesheet contains historical styling layers, so a variable’s final effective value can be set later than its first declaration. When changing a palette token, inspect the final overrides for both theme classes. Keep theme-specific exceptions together and scoped to the component that needs them.

**Color usage:**

- Main canvas separates the conversation workspace from raised panels.
- Panel is used for the sidebar, headers, dialogs, and composer shell.
- Surface and elevated surface distinguish controls, cards, and nested content from their parent.
- Primary text is for message bodies and main labels. Secondary and muted text are for supporting information, timestamps, hints, and metadata.
- Blue indicates outgoing messages and a small number of primary conversation actions. Use neutral focus/selection surfaces elsewhere unless the control already has a specific semantic accent.
- Red is reserved for destructive or emergency actions. Green, amber, and red should retain their status meaning.
- Borders should be subtle. Use `--bd-hi` for a visible control edge or stronger separation.

### Typography

- **Body and controls:** Space Grotesk, with the system sans-serif fallback. This is the application’s interface font.
- **Monospaced content:** Space Mono, with the monospace fallback. Use for USIDs, protocol-like values, timestamps where the component already does so, and inline or fenced code.
- **Display type:** Archivo Black is reserved for the brand or large entry-screen identity; do not use it for ordinary controls or message text.
- Default application text is compact and readable (approximately 14px, line-height 1.5). Use hierarchy through size, weight, and muted color rather than all-caps labels everywhere.
- Small uppercase labels are appropriate for compact section headings and metadata. Keep their tracking and weight consistent with nearby UI.
- Avoid shrinking message text to make a dense panel fit. Reflow or scroll the panel instead.

### Shape, spacing, and depth

Use the existing radius scale: `--r-sm` (8px), `--r` (12px), `--r-lg` (16px), and `--r-xl` (20px). Small controls may use a tighter radius; cards, dialogs, and composer shells use larger radii. The chat canvas itself should not be boxed into a card.

Use a consistent spacing rhythm based mainly on 4px increments. Typical compact control gaps are 6–10px; card padding is commonly 14–20px; dialog padding is commonly 20–32px. Preserve enough negative space around primary actions and headings. Do not use spacing to force an oversized empty state or an overly dense shortcut panel.

Depth should be understated. Prefer surface contrast and a one-pixel border over a shadow. Use the theme shadow tokens for dialogs and floating panels; avoid adding independent drop shadows to every card or control.

## Application layout

### Main messenger

- The desktop shell is organized as a conversation sidebar, central chat pane, and optional details pane.
- Keep the sidebar compact and scannable: brand and navigation at the top, search and contact/group actions next, conversations in the scrollable body, and theme/status actions in the footer.
- The chat pane has a stable header, a flexible scrolling message history, and a composer anchored at the bottom.
- A details pane may sit beside the chat. It must not displace message content unexpectedly on narrow viewports.
- Threading uses a side panel that remains visually subordinate to the active conversation.
- Use separators to clarify these areas; do not add heavy borders around every region.

### Messages

- Message bubbles should read as content first. Keep their width bounded so long text does not span the entire screen; allow long code, tables, and unbroken content to scroll or wrap within the bubble.
- Sent messages use the established blue treatment. Received messages use a panel-like neutral surface. Keep text and timestamp contrast legible in both themes.
- Replies and thread actions should appear on demand (for example, hover or focus) and remain keyboard reachable.
- Markdown output must fit the message typography and bubble shape. Code blocks and tables need their own bounded horizontal scrolling; never let them widen the chat layout.
- File-transfer cards and magnet links must retain their recognizable controls and status information when styling message content.

### Composer and Professional Mode

- The composer is the primary persistent action area. Keep attachment, editor, and send affordances aligned and easy to distinguish.
- Professional Mode adds its toolbar and Write/Preview tabs to the composer shell. The toolbar should feel integrated with the editor, not like a separate application panel.
- Group related formatting tools, use subtle dividers, and keep icon buttons compact. Provide tooltips and accessible labels for icon-only controls.
- The textarea may grow with its content up to the existing viewport/height cap. Keep the send button visible when the textarea scrolls internally.
- Keyboard shortcut documentation should use the same key-cap styling as the composer, fit its dialog to the viewport, and avoid horizontal scrolling. When space is limited, stack sections and allow vertical scrolling.

## Components and interaction states

Use existing component classes and tokens before creating a new visual pattern. Common patterns include:

- **Buttons:** Primary actions use a filled control with clear text contrast. Secondary actions are neutral and bordered. Destructive/emergency buttons use the danger color and should never look like ordinary primary actions.
- **Icon buttons:** Use a consistent hit area, rounded shape, visible hover surface, tooltip, and accessible name. Avoid using color alone to explain the action.
- **Inputs:** Use a surface distinct from the panel, a subtle border, and a visible focus ring. Keep labels outside placeholders so they remain available while typing.
- **Cards and rows:** Use a restrained border, stable padding, and clear selected/hover states. Selected conversation styling must be distinct in both themes without relying on a large shadow.
- **Dialogs:** Use a dimmed backdrop, panel surface, rounded corners, clear heading, one close affordance, and a content region that scrolls inside the viewport. On small screens, reduce outer margins and switch multi-column layouts to one column.
- **Status and warnings:** Keep statuses concise and pair color with text or an icon. Warnings should be noticeable without turning the entire interface into an alert surface.
- **Scroll areas:** Use a thin rounded thumb with a transparent or surface-matched track. Theme the thumb from border tokens; remove platform scrollbar buttons where supported. Preserve visible scroll affordance and keyboard scrolling.

Interactive states should be consistent:

1. Default: calm surface and readable label.
2. Hover: small surface or border change; avoid layout movement.
3. Focus-visible: a high-contrast ring using `--focus-ring`, with a small offset.
4. Active/selected: distinct surface or border, not only a color shift.
5. Disabled: muted and non-interactive, with status still understandable.

Use existing transition tokens (`--t-fast`, `--t-mid`, `--t-slow`, `--ease`) for UI motion. Keep feedback short and functional. Honor `prefers-reduced-motion`; avoid decorative loops, parallax, or animations that delay a security or messaging action.

## Responsive behavior

- Preserve the order of importance on narrow layouts: active conversation and composer first, navigation and details second.
- Collapse or hide secondary panes using the app’s established responsive behavior rather than shrinking all columns until text is unreadable.
- Dialog width should be bounded by the viewport with a comfortable edge margin. Its maximum height should fit inside the viewport, with scrolling applied to the content region rather than the entire page.
- Two-column settings or reference layouts should become one column when their rows no longer have enough width for labels and controls.
- Keep touch targets comfortable (around 40px or larger where practical), even when the visual icon itself is small.
- Avoid horizontal page scrolling. Contain horizontal scrolling to inherently wide content such as code blocks, tables, or a toolstrip that already communicates overflow.

## Accessibility and security-sensitive UI

- Use semantic elements for buttons, headings, dialogs, lists, and form fields. Give icon-only controls accessible names and use `aria-pressed`, `aria-expanded`, and `aria-keyshortcuts` where they describe real behavior.
- Keep keyboard focus visible and predictable when opening and closing dialogs. Escape should close dismissible dialogs when consistent with the flow.
- Maintain text/background contrast in both themes. Do not communicate verification, warning, or connection state by color alone.
- Markdown and message content are untrusted. Follow the security requirements in the threat model and the markdown renderer; visual styling must never require inserting unsanitized HTML.
- Remote content should not load automatically. Do not use UI decorations or previews that silently contact a third-party host.
- Keep clipboard, file, emergency, identity-verification, and encryption claims accurate to the underlying implementation.

## Implementation guidance

1. Read the relevant markup and existing selectors in `frontend/index.html` and `frontend/css/style.css` before changing a component.
2. Prefer the active tokens (`--bg-ink`, `--bg-panel`, `--bg-surface`, `--bg-elevated`, `--bg-hover`, `--fg`, `--fg-sub`, `--fg-muted`, `--bd`, `--bd-hi`, `--accent`, `--focus-ring`) over literal colors.
3. Scope new component rules to that component. Avoid broad selectors that unintentionally restyle existing pages.
4. Add both dark and light theme behavior. Verify contrast, borders, focus rings, hover states, code surfaces, and scrollbars in each.
5. Reuse existing typography, radius, motion, and shadow tokens. Add a token only when it represents a reusable design decision.
6. Preserve established behavior, accessibility labels, CSP, and security boundaries when making visual changes.
7. When a dialog or panel contains many controls, improve hierarchy and responsive reflow before reducing type size.

## Source of truth

The current implementation lives primarily in `frontend/css/style.css` and `frontend/index.html`; component behavior is wired in the corresponding vanilla JavaScript files under `frontend/js/`. This guide describes the intended visual contract. When the guide and a current screen disagree, identify whether the discrepancy is an intentional newer design or an old override before changing either. Update this document when a shared token, layout pattern, or interaction convention changes.
