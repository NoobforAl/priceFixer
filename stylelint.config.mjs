/**
 * Stylelint: ui.css plus the inline <style> blocks of popup.html and
 * options.html (parsed with postcss-html). Formatting is Prettier's job;
 * this catches real CSS problems (unknown properties, duplicate selectors,
 * rules that override each other).
 */
export default {
  extends: ['stylelint-config-standard'],
  rules: {
    // Layout only: the pages keep short rules on one line, grouped without blank lines.
    'declaration-block-single-line-max-declarations': null,
    'rule-empty-line-before': null,
    'custom-property-empty-line-before': null,
    // Chrome sets no minimum version; range syntax "(width <= 760px)" needs 104+.
    'media-feature-range-notation': 'prefix',
  },
  overrides: [
    {
      files: ['**/*.html'],
      customSyntax: 'postcss-html',
    },
  ],
};
