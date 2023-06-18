"use strict";
// See:
// https://replit.com/@LuisAFK/OT-Catchup#ot.js
//
Object.defineProperty(exports, "__esModule", { value: true });
exports.otsV2ToV1 = exports.otV2ToV1 = exports.diffsToOTs = exports.verifyOTs = exports.applyOTs = exports.flattenOTs = exports.simplifyOTs = void 0;
function simplifyOTs(ots, recurse) {
    var _a;
    if (recurse === void 0) { recurse = true; }
    // Remove unnecessary/empty skips/inserts
    var result1 = [];
    for (var i = 0; i < ots.length; i++) {
        var ot = ots[i];
        if (ot.skip == 0 || ((_a = ot.insert) === null || _a === void 0 ? void 0 : _a.length) == 0) {
            continue;
        }
        if (i == ots.length - 1 && ot.skip) {
            continue;
        }
        result1.push(ot);
    }
    // Combine consecutive skips/inserts
    var result2 = [];
    for (var i = 0; i < result1.length; i++) {
        var ot = result1[i];
        var nextOt = result1[i + 1];
        if (nextOt) {
            if (ot.insert && nextOt.insert) {
                result2.push({
                    insert: ot.insert + nextOt.insert,
                });
                continue;
            }
            if (ot.skip && nextOt.skip) {
                result2.push({
                    skip: ot.skip + nextOt.skip,
                });
                continue;
            }
        }
        result2.push(ot);
    }
    // Recurse until fully clean
    var result3 = result2;
    if (recurse) {
        var previousLength = result3.length;
        while (true) {
            result3 = simplifyOTs(result3, false);
            if (result3.length == previousLength) {
                break;
            }
            previousLength = result3.length;
        }
    }
    return result3;
}
exports.simplifyOTs = simplifyOTs;
function flattenOTs(ots, file) {
    // TIDO: actually flatten instead of goofy negative skip workaround
    if (file === void 0) { file = ''; }
    var result = [];
    for (var _i = 0, ots_1 = ots; _i < ots_1.length; _i++) {
        var otGroup = ots_1[_i];
        var _a = applyOTs(file, otGroup), cursor = _a.cursor, newFile = _a.file;
        file = newFile;
        console.debug(file, otGroup, cursor);
        result.push.apply(result, otGroup);
        result.push({
            skip: -cursor,
        });
    }
    return simplifyOTs(result);
}
exports.flattenOTs = flattenOTs;
function applyOTs(file, ots, start, err) {
    if (start === void 0) { start = 0; }
    if (err === void 0) { err = true; }
    var cursor = start;
    var _ots = simplifyOTs(otsV2ToV1(ots));
    for (var _i = 0, _ots_1 = _ots; _i < _ots_1.length; _i++) {
        var ot = _ots_1[_i];
        if (ot.insert) {
            file = file.substring(0, cursor) + ot.insert + file.substring(cursor);
            cursor += ot.insert.length;
        }
        else if (ot.delete) {
            if (cursor + ot.delete > file.length && err) {
                throw new Error("Can't delete past the end of a string");
            }
            file = file.substring(0, cursor) + file.substr(cursor + ot.delete);
        }
        else if (ot.skip) {
            cursor += ot.skip;
            if (cursor > file.length && err) {
                throw new Error("Can't skip past the end of a string");
            }
        }
    }
    return {
        file: file,
        cursor: cursor,
    };
}
exports.applyOTs = applyOTs;
function verifyOTs(stale, latest, ots, err) {
    if (err === void 0) { err = true; }
    try {
        return applyOTs(stale, ots, 0, err).file == latest;
    }
    catch (_a) {
        return false;
    }
}
exports.verifyOTs = verifyOTs;
function diffsToOTs(diffs) {
    var ots = [];
    for (var _i = 0, diffs_1 = diffs; _i < diffs_1.length; _i++) {
        var diff = diffs_1[_i];
        if (diff.added) {
            ots.push({
                insert: diff.value,
            });
        }
        else if (diff.removed) {
            ots.push({
                delete: diff.count,
            });
        }
        else {
            ots.push({
                skip: diff.count,
            });
        }
    }
    return simplifyOTs(ots);
}
exports.diffsToOTs = diffsToOTs;
function otV2ToV1(ot) {
    if ('op' in ot) {
        switch (ot.op) {
            case 'insert':
                return {
                    insert: ot.value,
                };
            case 'delete':
                return {
                    delete: ot.count,
                };
            case 'skip':
                return {
                    skip: ot.count,
                };
        }
    }
    return ot;
}
exports.otV2ToV1 = otV2ToV1;
function otsV2ToV1(ots) {
    return ots.map(otV2ToV1);
}
exports.otsV2ToV1 = otsV2ToV1;
