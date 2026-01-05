/**
 * DOMRect Fingerprinting Constants
 *
 * Known hash values and CSS for rect measurement.
 */

/**
 * Known valid rotate dimension hashes for Blink browsers.
 *
 * When a 100x100 element is rotated 45 degrees, the bounding box dimensions
 * should match one of these known patterns.
 */
export const BLINK_ROTATE_HASHES: Record<string, boolean> = {
  '9d9215cc': true, // 100, etc
  '47ded322': true, // 33, 67
  d0eceaa8: true, // 90
};

/**
 * Known valid rotate dimension hashes for Gecko browsers.
 */
export const GECKO_ROTATE_HASHES: Record<string, boolean> = {
  e38453f0: true, // 100, etc
};

/**
 * CSS for rect measurement elements.
 *
 * These styles create various transform combinations that produce
 * browser-specific bounding box calculations.
 */
export const RECT_STYLES = `
.rect-ghost,
.rect-known {
  top: 0;
  left: 0;
  position: absolute;
  visibility: hidden;
}
.rect-known {
  width: 100px;
  height: 100px;
  transform: rotate(45deg);
}
.rect-ghost {
  width: 0;
  height: 0;
}
.rects {
  width: 1000%;
  height: 1000%;
  max-width: 1000%;
}
.absolute {
  position: absolute;
}
#cRect1 {
  border: solid 2.715px;
  border-color: #F72585;
  padding: 3.98px;
  margin-left: 12.12px;
}
#cRect2 {
  border: solid 2px;
  border-color: #7209B7;
  font-size: 30px;
  margin-top: 20px;
  padding: 3.98px;
  transform: skewY(23.1753218deg) rotate3d(10.00099, 90, 0.100000000000009, 60000000000008.00000009deg);
}
#cRect3 {
  border: solid 2.89px;
  border-color: #3A0CA3;
  font-size: 45px;
  transform: skewY(-23.1753218deg) scale(1099.0000000099, 1.89) matrix(1.11, 2.0001, -1.0001, 1.009, 150, 94.4);
  margin-top: 50px;
}
#cRect4 {
  border: solid 2px;
  border-color: #4361EE;
  transform: matrix(1.11, 2.0001, -1.0001, 1.009, 150, 94.4);
  margin-top: 11.1331px;
  margin-left: 12.1212px;
  padding: 4.4545px;
  left: 239.4141px;
  top: 8.5050px;
}
#cRect5 {
  border: solid 2px;
  border-color: #4CC9F0;
  margin-left: 42.395pt;
}
#cRect6 {
  border: solid 2px;
  border-color: #F72585;
  transform: perspective(12890px) translateZ(101.5px);
  padding: 12px;
}
#cRect7 {
  margin-top: -350.552px;
  margin-left: 0.9099rem;
  border: solid 2px;
  border-color: #4361EE;
}
#cRect8 {
  margin-top: -150.552px;
  margin-left: 15.9099rem;
  border: solid 2px;
  border-color: #3A0CA3;
}
#cRect9 {
  margin-top: -110.552px;
  margin-left: 15.9099rem;
  border: solid 2px;
  border-color: #7209B7;
}
#cRect10 {
  margin-top: -315.552px;
  margin-left: 15.9099rem;
  border: solid 2px;
  border-color: #F72585;
}
#cRect11 {
  width: 10px;
  height: 10px;
  margin-left: 15.0000009099rem;
  border: solid 2px;
  border-color: #F72585;
}
#cRect12 {
  width: 10px;
  height: 10px;
  margin-left: 15.0000009099rem;
  border: solid 2px;
  border-color: #F72585;
}
#rect-container .shift-dom-rect {
  top: 1px !important;
  left: 1px !important;
}
`;
