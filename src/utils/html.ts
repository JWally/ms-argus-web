// DOM utilities for element measurement (used by fonts, domrect, svg modules)

/**
 * Replaces an existing DOM element with a new DocumentFragment and optionally
 * invokes a callback after the replacement.
 * @param oldEl - The element to be replaced, or null (in which case no operation occurs)
 * @param newEl - The DocumentFragment to insert in place of the old element
 * @param fn - Optional callback invoked after replacement; its return value is returned
 * @returns The result of `fn` if provided, `true` if replacement succeeded, or `null` if `oldEl` is falsy
 */
function patch(
  oldEl: HTMLElement | null,
  newEl: DocumentFragment,
  fn?: () => any,
) {
  if (!oldEl) return null;
  oldEl.parentNode?.replaceChild(newEl, oldEl);
  return typeof fn === 'function' ? fn() : true;
}

/**
 * Tagged template literal that creates a DocumentFragment from an HTML string.
 * Interpolated expressions are concatenated into the markup before parsing.
 * @param templateStr - The static portions of the tagged template literal
 * @param expressionSet - The interpolated expression values
 * @returns A deeply-cloned DocumentFragment representing the parsed HTML
 */
function html(templateStr: TemplateStringsArray, ...expressionSet: any[]) {
  const template = document.createElement('template');
  template.innerHTML = templateStr
    .map((s, i) => `${s}${expressionSet[i] || ''}`)
    .join('');
  return document.importNode(template.content, true);
}

export { patch, html };
