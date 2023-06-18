"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bitsToAscii = exports.bitsToOctal = exports.octalToAscii = exports.octalDigitToAscii = exports.octalDigitToAsciiMap = void 0;
exports.octalDigitToAsciiMap = [
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
    return exports.octalDigitToAsciiMap[digit];
}
exports.octalDigitToAscii = octalDigitToAscii;
function octalToAscii(n) {
    n = n.toString();
    var s = '';
    for (var _i = 0, n_1 = n; _i < n_1.length; _i++) {
        var digit = n_1[_i];
        s += octalDigitToAscii(parseInt(digit));
    }
    return s;
}
exports.octalToAscii = octalToAscii;
function bitsToOctal(b) {
    return (b & 511).toString(8);
}
exports.bitsToOctal = bitsToOctal;
function bitsToAscii(b) {
    return octalToAscii(bitsToOctal(b));
}
exports.bitsToAscii = bitsToAscii;
