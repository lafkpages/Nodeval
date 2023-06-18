"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.showUsage = void 0;
function showUsage() {
    console.log("\n    Usage: node . [options]\n  "
        .trim()
        .replace(/^ {4}/gm, ''));
}
exports.showUsage = showUsage;
