export const octalDigitToAsciiMap = [
  '---',
  '--x',
  '-w-',
  '-wx',
  'r--',
  'r-x',
  'rw-',
  'rwx',
];

export function octalDigitToAscii(digit: number) {
  if (digit < 0 || digit > 7) {
    throw new RangeError('Octal digit must be between [0,7]');
  }

  return octalDigitToAsciiMap[digit];
}

export function octalToAscii(n: number | string) {
  n = n.toString();

  let s = '';

  for (let digit of n) {
    s += octalDigitToAscii(parseInt(digit));
  }

  return s;
}

export function bitsToOctal(b: number) {
  return (b & 511).toString(8);
}

export function bitsToAscii(b: number) {
  return octalToAscii(bitsToOctal(b));
}
