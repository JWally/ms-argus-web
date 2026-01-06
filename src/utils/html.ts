// DOM utilities for element measurement (used by fonts, domrect, svg modules)

function patch(
  oldEl: HTMLElement | null,
  newEl: DocumentFragment,
  fn?: () => any,
) {
  if (!oldEl) return null;
  oldEl.parentNode?.replaceChild(newEl, oldEl);
  return typeof fn === 'function' ? fn() : true;
}

function html(templateStr: TemplateStringsArray, ...expressionSet: any[]) {
  const template = document.createElement('template');
  template.innerHTML = templateStr
    .map((s, i) => `${s}${expressionSet[i] || ''}`)
    .join('');
  return document.importNode(template.content, true);
}

export { patch, html };
