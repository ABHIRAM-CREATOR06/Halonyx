# Accessibility Test Report

**Project:** Halonyx  
**Test date:** 2026-11-02  
**Scope:** New Identity and Connect screens, plus limited manual keyboard and responsive checks  
**Standard:** WCAG 2.2 AA (automated checks tagged for WCAG 2.0, 2.1, and 2.2 A/AA)

## Summary

The two scanned authentication screens returned the same three confirmed axe-core findings. Manual keyboard checks also found form controls without programmatic labels and focusable controls in visually closed dialogs. No source code was changed as part of this test.

## Automated results

Scans used axe-core 4.14.0 through the axe CLI in a headless Chrome browser. The New Identity and Connect screens each returned the following findings:

| Severity | Finding | Affected element | WCAG success criterion |
|---|---|---|---|
| Critical | Element with `role="list"` has no required list-item child | `#contacts-list` | 1.3.1 Info and Relationships |
| Serious | Text contrast is 3.2:1, below the 4.5:1 requirement for normal text | `#start-add-contact` | 1.4.3 Contrast (Minimum) |
| Serious | Scrollable content is not keyboard-focusable | `.keyboard-shortcuts-content` | 2.1.1 Keyboard; 2.1.3 Keyboard (No Exception) |

Axe also returned items requiring human review:

- `.splash-tagline` contrast could not be conclusively evaluated automatically.
- `#keyboard-shortcuts-btn` received an incomplete `aria-valid-attr-value` result. This is not counted as a confirmed violation; inspect the rendered dialog relationship and assistive technology behavior.

## Manual findings

### High: visually closed dialogs remain keyboard reachable

In the initial unauthenticated state, keyboard Tab navigation reached controls in the hidden application and its closed dialogs. The dialog overlays were visually transparent and pointer-inactive, but remained visible to keyboard focus; their controls did not have `inert` or an equivalent hidden-state treatment. This can place focus on controls that users cannot see.

**Relevant criteria:** 2.1.1 Keyboard, 2.4.3 Focus Order, 4.1.2 Name, Role, Value.

### Medium: form controls lack programmatic labels

The Full Name and Email inputs on New Identity, the USID/email input on Connect, and the USID input in Add Contact had no associated `<label>`, `aria-label`, or `aria-labelledby`. Visible text or placeholders alone may not provide a reliable accessible name, especially after the placeholder disappears.

**Relevant criteria:** 1.3.1 Info and Relationships, 3.3.2 Labels or Instructions, 4.1.2 Name, Role, Value.

### Keyboard shortcuts content cannot receive keyboard focus

The `.keyboard-shortcuts-content` region scrolls but cannot itself be focused, so keyboard-only users may not be able to scroll through its full contents. Axe reported this in both scanned states.

## Responsive and assistive technology checks

At a 320 CSS-pixel viewport, the unauthenticated page did not produce horizontal document overflow. The sidebar displayed as an overlay. This was not a complete reflow evaluation because no authenticated conversation was available.

No screen reader was available for this pass. Screen-reader announcements, focus containment and restoration, Escape behavior, and live region behavior remain unverified. The light theme, open-dialog states, authenticated direct messages, groups, and thread panel were not scanned.

## Recommended remediation order

1. Keep controls in inactive application views and closed dialogs out of the tab order; restore focus appropriately when dialogs open and close.
2. Add explicit accessible labels to the affected form fields.
3. Give scrollable keyboard-shortcuts content a usable keyboard focus target.
4. Fix the contacts list structure and increase the Add Contact button text contrast to at least 4.5:1.
5. Review the splash tagline contrast and verify dialog semantics with a screen reader.
6. Repeat automated and manual checks in light and dark themes, authenticated DM/group/thread views, and at narrow viewport sizes.

## Manual follow-up checklist

- With NVDA on Windows, tab through New Identity and Connect; confirm each input announces a meaningful name and role.
- Open Add Contact and Keyboard Shortcuts; confirm focus enters the dialog, remains within it while open, Escape closes it, and focus returns to the trigger.
- Confirm closed dialogs and inactive app controls are absent from the tab sequence.
- Navigate and scroll the keyboard-shortcuts content using only the keyboard.
- Repeat contrast checks in both themes and test with a screen reader in authenticated chats.
