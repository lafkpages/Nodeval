const octalDigitToAsciiMap = [
  '---',
  '--x',
  '-w-',
  '-wx',
  'r--',
  'r-x',
  'rw-',
  'rwx',
];

function octalDigitToAscii(digit) {
  if (digit < 0 || digit > 7) {
    throw new RangeError('Octal digit must be between [0,7]');
  }

  return octalDigitToAsciiMap[digit];
}

function octalToAscii(n) {
  n = n.toString();

  let s = '';

  for (let digit of n) {
    digit = parseInt(digit);

    s += octalDigitToAscii(digit);
  }

  return s;
}

module.exports = {
  octalDigitToAscii,
  octalToAscii,
};
