"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cmdStringToArgs = exports.cmdArgsToString = exports.escapeQuotes = void 0;
function escapeQuotes(str) {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}
exports.escapeQuotes = escapeQuotes;
function cmdArgsToString(args) {
    return args
        .map(function (s) {
        // Escape quotes and escapes
        s = s.replace(/("|\\)/g, '\\$1');
        // Wrap in quotes
        s = "\"".concat(s, "\"");
        return s;
    })
        .join(' ');
}
exports.cmdArgsToString = cmdArgsToString;
function cmdStringToArgs(cmd, includeShC) {
    if (includeShC === void 0) { includeShC = true; }
    return includeShC
        ? ['sh', '-c', "'".concat(escapeQuotes(cmd), "'")]
        : _cmdStringToArgs(cmd).map(function (chunk) {
            return /\s/.test(chunk) ? "'".concat(escapeQuotes(chunk), "'") : chunk;
        });
}
exports.cmdStringToArgs = cmdStringToArgs;
function _cmdStringToArgs(cmd) {
    var result = [];
    var log_matches = false;
    var regex = /(([\w-/_~\.]+)|("(.*?)")|('(.*?)'))/g;
    var groups = [2, 4, 6];
    var match;
    while ((match = regex.exec(cmd)) !== null) {
        // This is necessary to avoid infinite loops
        // with zero-width matches
        if (match.index === regex.lastIndex) {
            regex.lastIndex++;
        }
        // For this to work the regex groups need to
        // be mutually exclusive
        groups.forEach(function (group) {
            if (match[group]) {
                result.push(match[group]);
            }
        });
        // show matches for debugging
        log_matches &&
            match.forEach(function (m, group) {
                if (m) {
                    console.log("Match '".concat(m, "' found in group: ").concat(group));
                }
            });
    }
    return result;
}
