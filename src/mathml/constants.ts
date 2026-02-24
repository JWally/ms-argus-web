/**
 * MathML Layout Fingerprinting Constants
 *
 * Test MathML markup snippets for layout measurement.
 * Each exercises a different part of the MathML layout engine.
 */

/**
 * MathML test elements.
 *
 * Each entry is [name, mathml_inner_html]. The markup is wrapped in
 * `<math>...</math>` at render time.
 */
export const MATHML_TEST_ELEMENTS: [string, string][] = [
  // Basic row: x + y
  ['mrow', '<mrow><mi>x</mi><mo>+</mo><mi>y</mi></mrow>'],
  // Summation with limits (under/over)
  [
    'munderover',
    '<munderover><mo>&#x2211;</mo><mrow><mi>i</mi><mo>=</mo><mn>0</mn></mrow><mi>n</mi></munderover>',
  ],
  // Tensor notation with prescripts
  [
    'mmultiscripts',
    '<mmultiscripts><mi>X</mi><mi>i</mi><mi>j</mi><mprescripts/><mi>a</mi><mi>b</mi></mmultiscripts>',
  ],
  // Fraction
  [
    'mfrac',
    '<mfrac><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow><mrow><mi>c</mi><mo>-</mo><mi>d</mi></mrow></mfrac>',
  ],
  // Square root of sum of squares
  [
    'msqrt',
    '<msqrt><msup><mi>a</mi><mn>2</mn></msup><mo>+</mo><msup><mi>b</mi><mn>2</mn></msup></msqrt>',
  ],
];
