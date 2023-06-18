"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkCommandsInteractive = exports.checkCommandInteractive = exports.checkCommand = void 0;
var child_process_1 = require("child_process");
;
;
function checkCommand(cmd) {
    var r = {
        installed: false,
        path: null,
        error: null,
    };
    return new Promise(function (resolve) {
        (0, child_process_1.exec)("command -v \"".concat(cmd, "\""), function (err, path, stderr) {
            if (err) {
                r.error = err;
                resolve(r);
            }
            else {
                stderr = stderr.trim();
                if (stderr) {
                    r.error = stderr;
                    resolve(r);
                }
                else {
                    r.installed = true;
                    path = path.trim();
                    if (path) {
                        r.path = path;
                    }
                    resolve(r);
                }
            }
        });
    });
}
exports.checkCommand = checkCommand;
function checkCommandInteractive(cmd, opts) {
    if (opts === void 0) { opts = {}; }
    return __awaiter(this, void 0, void 0, function () {
        var r;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    opts = __assign({ name: null, required: false, newLine: true, exitCode: 63, logFunc: null, url: null }, opts);
                    if (!opts.logFunc) {
                        opts.logFunc = opts.required ? console.error : console.warn;
                    }
                    return [4 /*yield*/, checkCommand(cmd)];
                case 1:
                    r = _a.sent();
                    if (r.installed) {
                        return [2 /*return*/, true];
                    }
                    opts.logFunc("".concat(opts.required ? 'Warning' : 'Error', ":").concat(opts.name ? '' : ' command', " \"").concat(opts.name || cmd, "\" not found, but is ").concat(opts.required ? 'required' : 'recommended', " by this program.").concat(opts.url ? " It can be downloaded at ".concat(opts.url) : '').concat(opts.newLine ? '\n' : ''));
                    if (opts.required) {
                        process.exit(opts.exitCode);
                    }
                    return [2 /*return*/, false];
            }
        });
    });
}
exports.checkCommandInteractive = checkCommandInteractive;
function checkCommandsInteractive(cmds, defaultOpts) {
    if (defaultOpts === void 0) { defaultOpts = {}; }
    return __awaiter(this, void 0, void 0, function () {
        var r, _i, _a, _b, cmd, opts, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    r = [];
                    defaultOpts = __assign({ newLine: false }, defaultOpts);
                    _i = 0, _a = Object.entries(cmds);
                    _e.label = 1;
                case 1:
                    if (!(_i < _a.length)) return [3 /*break*/, 4];
                    _b = _a[_i], cmd = _b[0], opts = _b[1];
                    if (typeof opts == 'boolean') {
                        opts = { required: opts };
                    }
                    opts = __assign(__assign({}, defaultOpts), opts);
                    _d = (_c = r).push;
                    return [4 /*yield*/, checkCommandInteractive(cmd, opts)];
                case 2:
                    _d.apply(_c, [_e.sent()]);
                    _e.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/, r];
            }
        });
    });
}
exports.checkCommandsInteractive = checkCommandsInteractive;
