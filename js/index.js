#!/usr/bin/env node
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
var makeConsoleSafe = require('safe-logging-replit').makeConsoleSafe;
makeConsoleSafe(console);
var _package = require("./package.json");
var arg = require("arg");
var os = require("os");
var osUtils = require("os-utils");
var ws_1 = require("ws");
var protocol_1 = require("@replit/protocol");
var child_process_1 = require("child_process");
var node_pty_1 = require("node-pty");
var replit_graphql_1 = require("replit-graphql");
var ot_1 = require("./util/ot");
var disk = require("diskusage");
var fs = require("fs");
var dotenv = require("dotenv");
var crc32 = require("crc/crc32");
var path_1 = require("path");
var toml_1 = require("toml");
var diff_1 = require("diff");
var minimatch_1 = require("minimatch");
var checkCommand_1 = require("./util/checkCommand");
var cmdArgs_1 = require("./util/cmdArgs");
var permissions_1 = require("./util/permissions");
var usage_1 = require("./util/usage");
dotenv.config();
var platform = os.platform();
var args = arg({
    '--help': Boolean,
    '--version': Boolean,
    '--port': Number,
    '--repl-id': String,
    '-h': '--help',
    '-V': '--version',
    '-p': '--port',
    '-r': '--repl-id',
});
var port = args['--port'] || parseInt(process.env.NODEVAL_PORT || '') || 4096;
var shell = process.env.NODEVAL_SHELL ||
    (platform == 'win32' ? 'powershell.exe' : 'bash');
var nodevalReplId = args['--repl-id'] || process.env.NODEVAL_REPL_ID || null;
if (args['--help']) {
    (0, usage_1.showUsage)();
    process.exit(0);
}
else if (args['--version']) {
    console.log(_package.version);
    process.exit(0);
}
if (!nodevalReplId) {
    console.warn('Warning: no Nodeval Repl ID specified. All Repls will be passed to Nodeval.');
}
// TODO: if the user connects from a Repl that isn't nodevalReplId, proxy to normal Replit Goval
process.on('uncaughtException', function (err) {
    if (err.code == 'EADDRINUSE') {
        console.error('Port', port, "is already in use. Try running the following to kill the process using it:\nkill -15 `sudo lsof -i :".concat(port, " | tail -n +2 | awk '{ print $2 }'`"));
        process.exit(4);
    }
    else {
        console.error(err);
        process.exit(3);
    }
});
var wss = new ws_1.WebSocketServer({ port: port });
var lastSessId = 1;
var replId = nodevalReplId;
var replUrl = null;
// Create .env
fs.writeFile('.env', '', { flag: 'wx' }, function () { });
// Create .replit
try {
    fs.writeFileSync('.replit', "\nrun = \"echo Hello, World!\"\nhidden = [ \".DS_Store\", \".file-history.json\", \".vscode\", \".env\" ]\n\n[nodeval]\ninaccessibleFiles = [ \".DS_Store\", \".env\", \".file-history.json\" ]\n", { encoding: 'utf-8', flag: 'wx' });
}
catch (_a) { }
// Create file history file
try {
    fs.writeFileSync('.file-history.json', '{}', { flag: 'wx' });
}
catch (_b) { }
// Warn the user if a configured LSP server isn't installed
var hasWarnedForLsp = {};
// dotReplit config
var dotReplit = {};
var dotReplitDefaultRunCommand = "echo Run isn't configured. Try adding a .replit and configuring it https://docs.replit.com/programming-ide/configuring-run-button";
function loadDotReplit() {
    var _this = this;
    return new Promise(function (resolve, reject) {
        fs.readFile('.replit', 'utf-8', function (err, data) { return __awaiter(_this, void 0, void 0, function () {
            var _i, _a, _b, lang, conf, startCmd, startCmdNameMatch, startCmdName, installed;
            var _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        if (err) {
                            console.error('Error reading .replit:', err);
                            reject(err);
                            return [2 /*return*/];
                        }
                        try {
                            dotReplit = (0, toml_1.parse)(data);
                        }
                        catch (err) {
                            console.error('Error parsing .replit:', err);
                            reject(err);
                            return [2 /*return*/];
                        }
                        dotReplit.run = dotReplit.run || dotReplitDefaultRunCommand;
                        dotReplit.fullRunCommand = "sh -c '".concat((0, cmdArgs_1.escapeQuotes)(dotReplit.run), "'");
                        dotReplit.fullRunCommandArgs = (0, cmdArgs_1.cmdStringToArgs)(dotReplit.run);
                        if (!dotReplit.languages) return [3 /*break*/, 4];
                        _i = 0, _a = Object.entries(dotReplit.languages);
                        _d.label = 1;
                    case 1:
                        if (!(_i < _a.length)) return [3 /*break*/, 4];
                        _b = _a[_i], lang = _b[0], conf = _b[1];
                        // Avoid duplicate warns
                        if (hasWarnedForLsp[lang]) {
                            return [3 /*break*/, 3];
                        }
                        startCmd = (_c = conf === null || conf === void 0 ? void 0 : conf.languageServer) === null || _c === void 0 ? void 0 : _c.start;
                        if (!startCmd) {
                            return [3 /*break*/, 3];
                        }
                        startCmdNameMatch = startCmd.match(/^(\S+)/);
                        if (!startCmdNameMatch) {
                            return [3 /*break*/, 3];
                        }
                        startCmdName = startCmdNameMatch[1];
                        return [4 /*yield*/, (0, checkCommand_1.checkCommandInteractive)(startCmdName, {
                                newLine: false,
                            })];
                    case 2:
                        installed = _d.sent();
                        if (!installed) {
                            hasWarnedForLsp[lang] = true;
                        }
                        _d.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4:
                        resolve(dotReplit);
                        return [2 /*return*/];
                }
            });
        }); });
    });
}
loadDotReplit().then(function () {
    console.debug('Loaded dotReplit');
});
setInterval(loadDotReplit, 5000);
// Get current TTY
var currentTty = null;
try {
    currentTty = (0, child_process_1.execSync)('tty', {
        stdio: ['inherit', 'pipe', 'pipe'],
    })
        .toString()
        .trim();
}
catch (err) {
    console.error('Error getting current TTY:', err);
}
// ANSI codes to clear the screen
var ansiClear = '\x1b[H\x1b[J\r';
function randomStr() {
    return Math.random().toString(36).substring(2);
}
function startPty(sessionId, chanId, ws, infoCallback) {
    var _a;
    var _b = infoCallback(), replId = _b[0], username = _b[1], userId = _b[2], replUrl = _b[3];
    var channels = sessions[sessionId].channels;
    channels[chanId].processPtyDev = null;
    if (typeof channels[chanId].showOutput != 'boolean') {
        channels[chanId].showOutput = true;
    }
    channels[chanId].process = (0, node_pty_1.spawn)(shell, [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: process.cwd(),
        env: __assign(__assign(__assign({}, process.env), dotReplit.env), { PATH: "".concat(__dirname, "/bin:").concat(process.env.PATH), NODEVAL_TTY: currentTty || '', NODEVAL_PID: process.pid, GOVAL_SESSION: sessionId, GOVAL_VERSION: "".concat(_package.name, "-").concat(_package.version), PS1: '\\[\\e[0;1;38;5;33m\\]\\u\\[\\e[0;2m\\]@\\[\\e[0;1;38;5;34m\\]\\h\\[\\e[0;2m\\] - \\[\\e[0;3;38;5;227m\\]\\W\\[\\e[0;2;3m\\]: \\[\\e[0m\\]', REPL_ID: replId, REPL_OWNER: username, REPL_OWNER_ID: userId, REPL_URL: replUrl }),
    });
    channels[chanId].process.on('data', function (output) {
        if (channels[chanId].processPtyDev) {
            if (channels[chanId].showOutput) {
                ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                    channel: chanId,
                    output: output,
                })).finish());
                if (channels[chanId].openChan.service == 'shellrun2') {
                    ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                        channel: chanId,
                        record: output,
                    })).finish());
                }
            }
        }
        else {
            var match = output.match(/^ptyDev:(.+?):ptyDev/m);
            if (match) {
                channels[chanId].processPtyDev = match[1];
            }
            console.log('Spawned shell:', channels[chanId].processPtyDev);
        }
    });
    setTimeout(function () {
        if (channels[chanId].process instanceof child_process_1.ChildProcess) {
            return;
        }
        channels[chanId].process.write('echo -n "ptyDev:"`tty`":ptyDev"\r');
    }, 10);
    (_a = channels[chanId].process) === null || _a === void 0 ? void 0 : _a.on('exit', function () {
        console.log('Shell exited, respawning...');
        startPty(sessionId, chanId, ws, infoCallback);
    });
}
function makeTimestamp(now) {
    if (now === void 0) { now = null; }
    now = now || Date.now();
    return {
        seconds: Math.floor(now / 1000),
        nanos: 0,
    };
}
// Import previous file history
var fileHistory = require(process.cwd() + '/.file-history.json');
// Session to WS map
var sessions = {};
wss.on('connection', function (ws) {
    var _a;
    ws.isAlive = true;
    console.log('Client connecting...');
    var channels = {};
    var lastChanId = 0;
    var userId = null;
    var username = null;
    var sessionId = ++lastSessId;
    var activeFile = null;
    var sentJoinEvent = false;
    sessions[sessionId] = {
        ws: ws,
        channels: channels,
        userId: userId,
        username: username,
        activeFile: activeFile,
    };
    ws.onDisconnected = function () {
        console.log('Client disconnected: user ID', userId, "aka \"@".concat(username, "\", session ID"), sessionId);
        delete sessions[sessionId];
        // Send leave event to all other sessions
        for (var _i = 0, _a = Object.values(sessions); _i < _a.length; _i++) {
            var _b = _a[_i], channels_1 = _b.channels, wsIter = _b.ws;
            for (var _c = 0, _d = Object.entries(channels_1); _c < _d.length; _c++) {
                var _e = _d[_c], chanId = _e[0], channel = _e[1];
                if (channel.openChan.service != 'presence') {
                    continue;
                }
                wsIter.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                    channel: parseInt(chanId),
                    session: -sessionId,
                    part: {
                        id: userId,
                        session: sessionId,
                        name: username,
                    },
                })).finish());
            }
        }
    };
    ws.on('close', ws.onDisconnected);
    ws.on('pong', function () {
        ws.isAlive = true;
    });
    ws.on('message', function (rawMsg) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        var msg;
        if (rawMsg instanceof ArrayBuffer) {
            msg = protocol_1.api.Command.decode(new Uint8Array(rawMsg));
        }
        else if (rawMsg instanceof Array) {
            throw new TypeError('Got Array in WebSocket message (TODO)');
        }
        else {
            msg = protocol_1.api.Command.decode(rawMsg);
        }
        if (msg.channel) {
            msg._service = channels[msg.channel].openChan.service;
            msg._chanName = channels[msg.channel].openChan.name;
        }
        if (msg.ping) {
            ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                channel: 0,
                ref: msg.ref,
                pong: {},
            })).finish());
        }
        else if (msg.openChan && msg.openChan.service) {
            console.debug("Opening channel \"".concat(msg.openChan.name, "\"\twith service \"").concat(msg.openChan.service, "\": ").concat(msg.openChan.action));
            var chanId_1 = ++lastChanId;
            channels[chanId_1] = {
                openChan: msg.openChan,
            };
            // TODO: use msg.openChan.action (CREATE|ATTACH|ATTACH_OR_CREATE)
            switch (msg.openChan.service) {
                case 'fsevents':
                    channels[chanId_1].subscriptions = {};
                    break;
                case 'shell':
                case 'shellrun2':
                    startPty(sessionId, chanId_1, ws, function () {
                        return [replId, username, userId, replUrl];
                    });
                    if (msg.openChan.service == 'shellrun2') {
                        setTimeout(function () {
                            ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                                channel: chanId_1,
                                state: protocol_1.api.State.Stopped,
                            })).finish());
                        }, 10);
                    }
                    break;
                case 'ot':
                    channels[chanId_1].subscriptions = {};
                    channels[chanId_1].otstatus = {
                        content: '',
                        version: 0,
                        linkedFile: null,
                        cursors: [],
                    };
                    setTimeout(function () {
                        ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                            channel: chanId_1,
                            ref: msg.ref,
                            otstatus: channels[chanId_1].otstatus,
                        })).finish());
                    }, 10);
                    break;
                case 'presence':
                    setTimeout(function () {
                        ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                            channel: chanId_1,
                            session: sessionId,
                            roster: {
                                user: Object.entries(sessions).map(function (entry) { return ({
                                    id: entry[1].userId,
                                    name: entry[1].username,
                                    session: parseInt(entry[0]),
                                }); }),
                                files: Object.entries(sessions).map(function (entry) { return ({
                                    file: entry[1].activeFile,
                                    userId: entry[1].userId,
                                    session: parseInt(entry[0]),
                                    timestamp: makeTimestamp(),
                                }); }),
                            },
                        })).finish());
                    }, 10);
                    break;
            }
            ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                channel: 0,
                ref: msg.ref,
                openChanRes: {
                    id: chanId_1,
                },
                session: sessionId,
            })).finish());
        }
        else if (msg.closeChan) {
            switch (msg._service) {
                case 'ot':
                    if (channels[msg.closeChan.id].subscriptions) {
                        for (var _i = 0, _j = Object.entries(channels[msg.closeChan.id].subscriptions); _i < _j.length; _i++) {
                            var _k = _j[_i], path = _k[0], watcher = _k[1];
                            watcher.close();
                        }
                    }
                    break;
            }
            // TODO: use msg.closeChan.action (DISCONNECT|CLOSE|TRY_CLOSE)
            delete channels[msg.closeChan.id];
            console.log('Closing channel ID', msg.closeChan.id, "with service \"".concat(msg._service, "\":"), msg.closeChan.action);
            ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                channel: 0,
                ref: msg.ref,
                closeChanRes: {
                    id: msg.closeChan.id,
                    status: protocol_1.api.CloseChannelRes.Status.CLOSE,
                },
            })).finish());
        }
        else if (msg.userEvent) {
            if (msg.userEvent.eventName == 'meta:ready' ||
                msg.userEvent.eventName == 'meta:start') {
                replId = ((_a = msg.userEvent.eventData) === null || _a === void 0 ? void 0 : _a.fields.replId.stringValue) || null;
                replUrl = ((_b = msg.userEvent.eventData) === null || _b === void 0 ? void 0 : _b.fields.url.stringValue) || null;
                userId = ((_c = msg.userEvent.eventData) === null || _c === void 0 ? void 0 : _c.fields.userId.numberValue) || null;
                sessions[sessionId].userId = userId;
                // Get username
                (0, replit_graphql_1.query)('query user($id: Int!) { user(id: $id) { username } }', {
                    variables: {
                        id: userId,
                    },
                }).then(function (res) {
                    var _a;
                    username = res.data.user.username;
                    sessions[sessionId].username = username;
                    console.log('Client is', ((_a = msg.userEvent) === null || _a === void 0 ? void 0 : _a.eventName) == 'meta:ready' ? 'ready' : 'starting', 'user ID', userId, "aka \"@".concat(username, "\", session ID"), sessionId);
                    if (!sentJoinEvent) {
                        sentJoinEvent = true;
                        // Send join event to all other sessions
                        for (var _i = 0, _b = Object.values(sessions); _i < _b.length; _i++) {
                            var _c = _b[_i], channels_2 = _c.channels, wsIter = _c.ws;
                            for (var _d = 0, _e = Object.entries(channels_2); _d < _e.length; _d++) {
                                var _f = _e[_d], chanId = _f[0], channel = _f[1];
                                if (channel.openChan.service != 'presence') {
                                    continue;
                                }
                                wsIter.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                                    channel: parseInt(chanId),
                                    session: -sessionId,
                                    join: {
                                        id: userId,
                                        session: sessionId,
                                        name: username,
                                    },
                                })).finish());
                            }
                        }
                    }
                });
            }
            else if (msg.userEvent.eventName == 'user:run:output' ||
                msg.userEvent.eventName.startsWith('user:shell:')) {
                // ignore
            }
            else {
                console.log("Received user event \"".concat(msg.userEvent.eventName, "\":"), msg.userEvent.eventData);
            }
        }
        else if (msg.exec) {
            if (msg.exec.args[0] == 'bash' &&
                msg.exec.args[1] == '-c' &&
                msg.exec.args[2] ==
                    "date '+%s%N' && cat /sys/fs/cgroup/cpu/cpuacct.usage /sys/fs/cgroup/cpu/cpu.cfs_quota_us /sys/fs/cgroup/cpu/cpu.cfs_period_us /sys/fs/cgroup/memory/memory.usage_in_bytes /sys/fs/cgroup/memory/memory.soft_limit_in_bytes /sys/fs/cgroup/memory/memory.limit_in_bytes &&grep '^\\(total_rss\\|total_cache\\) ' /sys/fs/cgroup/memory/memory.stat") {
                ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                    channel: msg.channel,
                    state: protocol_1.api.State.Running,
                })).finish());
                osUtils.cpuUsage(function (cpuUsagePercent) {
                    var freeMemory = osUtils.freemem();
                    var totalMemory = osUtils.totalmem();
                    var memoryUsage = totalMemory - freeMemory;
                    var cpuTime = process.cpuUsage();
                    ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                        channel: msg.channel,
                        ref: msg.ref,
                        output: "".concat(Date.now() * 1000000, "\n").concat(cpuTime.system * 1000, "\n200000\n100000\n").concat(memoryUsage, "\n").concat(totalMemory, "\n").concat(totalMemory, "\ntotal_cache 36864\ntotal_rss ").concat(totalMemory),
                    })).finish());
                    setTimeout(function () {
                        ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                            channel: msg.channel,
                            state: protocol_1.api.State.Stopped,
                        })).finish());
                    }, 10);
                });
            }
            else if (msg.exec.args[0] == 'bash' &&
                msg.exec.args[1] == '-c' &&
                msg.exec.args[2] ==
                    'cat /repl/stats/subvolume_usage_bytes /repl/stats/subvolume_total_bytes') {
                ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                    channel: msg.channel,
                    state: protocol_1.api.State.Running,
                })).finish());
                disk.check('.', function (err, diskUsage) {
                    // TODO: handle errors
                    if (diskUsage) {
                        ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                            channel: msg.channel,
                            output: "".concat(diskUsage.total - diskUsage.free, "\n").concat(diskUsage.total, "\n"),
                        })).finish());
                        setTimeout(function () {
                            ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                                channel: msg.channel,
                                ref: msg.ref,
                                ok: {},
                            })).finish());
                            setTimeout(function () {
                                ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                                    channel: msg.channel,
                                    state: protocol_1.api.State.Stopped,
                                })).finish());
                            }, 10);
                        }, 10);
                    }
                });
            }
            else {
                var cmd = (0, cmdArgs_1.cmdArgsToString)(msg.exec.args);
                ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                    channel: msg.channel,
                    state: protocol_1.api.State.Running,
                })).finish());
                // Run the command
                (0, child_process_1.exec)(cmd, {
                    env: msg.exec.env || process.env,
                }, function (error, stdout, stderr) {
                    ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                        channel: msg.channel,
                        ref: msg.ref,
                        output: stdout,
                    })).finish());
                    var res = stderr.trim()
                        ? {
                            error: stderr,
                        }
                        : {
                            ok: {},
                        };
                    ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create(__assign({ channel: msg.channel, ref: msg.ref }, res))).finish());
                    setTimeout(function () {
                        ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                            channel: msg.channel,
                            state: protocol_1.api.State.Stopped,
                        })).finish());
                    }, 10);
                });
            }
        }
        else if (msg.readdir) {
            fs.readdir(msg.readdir.path, {
                withFileTypes: true,
            }, function (err, files) {
                ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                    channel: msg.channel,
                    ref: msg.ref,
                    files: {
                        files: (files === null || files === void 0 ? void 0 : files.filter(function (file) {
                            var _a;
                            if (!((_a = dotReplit === null || dotReplit === void 0 ? void 0 : dotReplit.nodeval) === null || _a === void 0 ? void 0 : _a.inaccessibleFiles)) {
                                return true;
                            }
                            var matched = false;
                            for (var _i = 0, _b = dotReplit.nodeval
                                .inaccessibleFiles; _i < _b.length; _i++) {
                                var glob = _b[_i];
                                matched = (0, minimatch_1.minimatch)(file.name, glob, {
                                    matchBase: true,
                                });
                                if (matched) {
                                    break;
                                }
                            }
                            return !matched;
                        }).map(function (file) { return ({
                            path: file.name,
                            type: file.isDirectory()
                                ? protocol_1.api.File.Type.DIRECTORY
                                : protocol_1.api.File.Type.REGULAR,
                        }); })) || [],
                    },
                })).finish());
            });
        }
        else if (msg.subscribeFile) {
            var _loop_1 = function (file) {
                var filePath = file.path;
                if (channels[msg.channel].subscriptions) {
                    if (filePath in channels[msg.channel].subscriptions) {
                        ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                            channel: msg.channel,
                            ref: msg.ref,
                            ok: {},
                        })).finish());
                    }
                    else {
                        try {
                            fs.lstat(filePath, function (err, stats) {
                                // TODO: handle errors
                                var fileIsDir = stats.isDirectory();
                                channels[msg.channel].subscriptions[filePath] = fs.watch(filePath, function (e, filename) {
                                    var filenamePath = fileIsDir
                                        ? (0, path_1.join)(filePath, filename)
                                        : filePath;
                                    if (e == 'rename') {
                                        ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                                            channel: msg.channel,
                                            fileEvent: {
                                                file: {
                                                    path: filenamePath,
                                                },
                                                op: null, // TODO: set to 'Remove' when a file is moved/deleted
                                            },
                                        })).finish());
                                    }
                                });
                            });
                            ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                                channel: msg.channel,
                                ref: msg.ref,
                                ok: {},
                            })).finish());
                        }
                        catch (err) {
                            ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                                channel: msg.channel,
                                ref: msg.ref,
                                error: "unable to subscribe file from fsevents: ".concat(err instanceof Error ? err.message : err),
                            })).finish());
                        }
                    }
                }
            };
            for (var _l = 0, _m = msg.subscribeFile.files; _l < _m.length; _l++) {
                var file = _m[_l];
                _loop_1(file);
            }
            ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                channel: msg.channel,
                ref: msg.ref,
                ok: {},
            })).finish());
        }
        else if (msg.openFile) {
            var path = msg.openFile.file ? (0, path_1.normalize)(msg.openFile.file) : null;
            activeFile = path;
            sessions[sessionId].activeFile = activeFile;
            console.debug('User', username, 'opened file:', path, '(presence)');
            var timestamp = makeTimestamp();
            for (var _o = 0, _p = Object.values(sessions); _o < _p.length; _o++) {
                var _q = _p[_o], channels_3 = _q.channels, wsIter = _q.ws;
                for (var _r = 0, _s = Object.entries(channels_3); _r < _s.length; _r++) {
                    var _t = _s[_r], chanId = _t[0], channel = _t[1];
                    if (channel.openChan.service != 'presence') {
                        continue;
                    }
                    wsIter.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                        channel: parseInt(chanId),
                        session: -sessionId,
                        fileOpened: {
                            file: activeFile,
                            userId: userId,
                            session: sessionId,
                            timestamp: timestamp,
                        },
                    })).finish());
                }
            }
        }
        else if (msg.followUser) {
            console.debug("@".concat(username, " following @").concat(sessions[msg.followUser.session].username));
            sessions[msg.followUser.session].ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                channel: msg.channel,
                session: msg.followUser.session,
                followUser: {
                    session: sessionId,
                },
            })).finish());
        }
        else if (msg.unfollowUser) {
            console.debug("@".concat(username, " unfollowing @").concat(sessions[msg.unfollowUser.session].username));
            sessions[msg.unfollowUser.session].ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                channel: msg.channel,
                session: msg.unfollowUser.session,
                unfollowUser: {
                    session: sessionId,
                },
            })).finish());
        }
        else if ( /*msg.otLinkFile?.file.path || */msg.read) {
            var file_1 = /*msg.otLinkFile?.file.path || */ msg.read.path;
            fs.readFile(file_1, function (err, data) {
                if (err) {
                    if (err.code == 'ENOENT') {
                        ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                            channel: msg.channel,
                            ref: msg.ref,
                            session: sessionId,
                            error: "unable to read file content from gcsfiles: open ".concat(file_1, ": no such file or directory"),
                        })).finish());
                    }
                    else {
                        ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                            channel: msg.channel,
                            ref: msg.ref,
                            session: sessionId,
                            error: "unable to read file content from gcsfiles: ".concat(err.message),
                        })).finish());
                    }
                }
                else {
                    var bdata = new Uint8Array(data);
                    var res = msg.otLinkFile
                        ? {
                            otLinkFileResponse: {
                                version: 1,
                                linkedFile: {
                                    path: file_1,
                                    content: bdata,
                                },
                            },
                        }
                        : {
                            file: {
                                path: file_1,
                                content: bdata,
                            },
                        };
                    ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create(__assign({ channel: msg.channel, ref: msg.ref, session: sessionId }, res))).finish());
                }
            });
        }
        else if (msg.write) {
            var content = msg.write.content || '';
            fs.writeFile(msg.write.path, msg.write.content, function (err) {
                if (err) {
                    ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                        channel: msg.channel,
                        ref: msg.ref,
                        error: "unable to write file content from gcsfiles: ".concat(err.message),
                    })).finish());
                }
                else {
                    ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                        channel: msg.channel,
                        ref: msg.ref,
                        ok: {},
                    })).finish());
                }
            });
        }
        else if (msg.otLinkFile) {
            if (channels[msg.channel].otstatus) {
                var path_2 = msg.otLinkFile.file ? (0, path_1.normalize)(msg.otLinkFile.file.path) : null;
                if (path_2) {
                    fs.readFile(path_2, function (err, data) {
                        if (err) {
                            ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                                channel: msg.channel,
                                ref: msg.ref,
                                error: "unable to read file content from ot: open ".concat(path_2, ": no such file or directory"),
                            })).finish());
                            return;
                        }
                        var now = Date.now();
                        if (!fileHistory[path_2]) {
                            fileHistory[path_2] = {
                                versions: [
                                    {
                                        spookyVersion: 1,
                                        op: [
                                            {
                                                insert: data.toString('utf-8'),
                                            },
                                        ],
                                        crc32: crc32(data),
                                        comitted: makeTimestamp(),
                                        version: 1,
                                        userId: userId,
                                    },
                                ],
                            };
                            console.log('Created initial version of', path_2);
                        }
                        channels[msg.channel].otstatus.linkedFile = path_2;
                        channels[msg.channel].otstatus.version =
                            fileHistory[path_2].versions.length;
                        ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                            channel: msg.channel,
                            ref: msg.ref,
                            session: sessionId,
                            otLinkFileResponse: {
                                version: fileHistory[path_2].versions.length,
                                linkedFile: {
                                    path: path_2,
                                    content: data.toString('base64'),
                                },
                            },
                        })).finish());
                        setTimeout(function () {
                            ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                                channel: msg.channel,
                                ref: msg.ref,
                                ok: {},
                            })).finish());
                        }, 10);
                        var watcher = null;
                        watcher = fs.watch(path_2, function (e, filename) {
                            if (!channels[msg.channel]) {
                                watcher.close();
                                return;
                            }
                            if (e == 'change') {
                                // Check if change is because of flushing OTs
                                if (!channels[msg.channel].flushing) {
                                    var cursorId = randomStr();
                                    var cursor = {
                                        position: 0,
                                        selectionStart: 0,
                                        selectionEnd: 0,
                                        user: {
                                            name: 'replit',
                                        },
                                        id: cursorId,
                                    };
                                    channels[msg.channel].otstatus.cursors.push(cursor);
                                    ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                                        channel: msg.channel,
                                        otNewCursor: cursor,
                                    })).finish());
                                    // Get old file contents
                                    var oldContents_1 = '';
                                    for (var _i = 0, _a = fileHistory[path_2].versions; _i < _a.length; _i++) {
                                        var version = _a[_i];
                                        oldContents_1 = (0, ot_1.applyOTs)(oldContents_1, version.op).file;
                                    }
                                    // TODO: iterate over versions and apply individually
                                    // Get new file contents
                                    fs.readFile(path_2, 'utf-8', function (err, newContents) {
                                        // TODO: handle errors
                                        // Check if there were changes
                                        if (oldContents_1 == newContents) {
                                            return;
                                        }
                                        // Get file changes as OTs
                                        var ots = (0, ot_1.diffsToOTs)((0, diff_1.diffChars)(oldContents_1, newContents));
                                        var newVersion = fileHistory[path_2].versions.length + 1;
                                        // Construct OT packet
                                        var packet = {
                                            spookyVersion: newVersion,
                                            op: ots,
                                            crc32: crc32(newContents),
                                            comitted: makeTimestamp(now),
                                            version: newVersion,
                                        };
                                        // Send to client
                                        ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                                            channel: msg.channel,
                                            ot: packet,
                                        })).finish());
                                        // Save to file history
                                        fileHistory[path_2].versions.push(packet);
                                    });
                                }
                            }
                        });
                        channels[msg.channel].subscriptions[path_2] = watcher;
                    });
                }
                else {
                    // TODO: handle missing path
                }
            }
        }
        else if (msg.otNewCursor) {
            if (channels[msg.channel].otstatus) {
                channels[msg.channel].otstatus.cursors.push({
                    position: msg.otNewCursor.position,
                    selectionStart: msg.otNewCursor.selectionStart,
                    selectionEnd: msg.otNewCursor.selectionEnd,
                    user: {
                        id: msg.otNewCursor.user.id,
                        name: msg.otNewCursor.user.name,
                    },
                    id: msg.otNewCursor.id,
                });
            }
        }
        else if (msg.otDeleteCursor) {
            if (channels[msg.channel].otstatus) {
                channels[msg.channel].otstatus.cursors = channels[msg.channel].otstatus.cursors.filter(function (cursor) { return cursor.id != msg.otDeleteCursor.id; });
            }
        }
        else if (msg.ot) {
            var file_2 = (0, path_1.normalize)((_d = channels[msg.channel].otstatus) === null || _d === void 0 ? void 0 : _d.linkedFile) || null;
            if (file_2) {
                fs.readFile(file_2, 'utf-8', function (err, data) {
                    // TODO: handle errors
                    try {
                        var newFile = (0, ot_1.applyOTs)(data, msg.ot.op, 0, true);
                        var now = Date.now();
                        var newVersion = fileHistory[file_2].versions.length + 1;
                        var packet = {
                            spookyVersion: newVersion,
                            op: msg.ot.op,
                            crc32: crc32(newFile.file),
                            comitted: makeTimestamp(now),
                            version: newVersion,
                            userId: userId,
                        };
                        fileHistory[file_2].versions.push(packet);
                        ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                            channel: msg.channel,
                            ref: msg.ref,
                            session: sessionId,
                            ot: packet,
                        })).finish());
                        // Prevent the watch file handler from
                        // otLinkFile from firing
                        channels[msg.channel].flushing = true;
                        fs.writeFile(file_2, newFile.file, 'utf-8', function (err) {
                            // TODO: handle errors
                            // TODO: only flush when needed
                            console.debug('Flushed OTs');
                            setTimeout(function () {
                                if (channels[msg.channel]) {
                                    channels[msg.channel].flushing = false;
                                }
                            }, 100);
                        });
                        setTimeout(function () {
                            ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                                channel: msg.channel,
                                ref: msg.ref,
                                session: sessionId,
                                ok: {},
                            })).finish());
                        }, 10);
                    }
                    catch (err) {
                        ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                            channel: msg.channel,
                            ref: msg.ref,
                            session: sessionId,
                            error: err.message,
                        })).finish());
                    }
                });
            }
        }
        else if (msg.otFetchRequest) {
            // TODO: don't ignore versionFrom and versionTo
            var path = (0, path_1.normalize)((_e = channels[msg.channel].otstatus) === null || _e === void 0 ? void 0 : _e.linkedFile);
            console.log('Got', fileHistory[path].versions.length, 'versions from file history');
            ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                channel: msg.channel,
                ref: msg.ref,
                session: sessionId,
                otFetchResponse: {
                    packets: fileHistory[path].versions,
                },
            })).finish());
        }
        else if (msg.flush) {
            // TODO: flusing now instead of on every OT
            ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                channel: msg.channel,
                ref: msg.ref,
                session: sessionId,
                ok: {},
            })).finish());
        }
        else if (msg.remove) {
            fs.rm(msg.remove.path, {
                force: true,
                recursive: true,
            }, function (err) {
                // TODO: handle errors
                console.log('Removed file', msg.remove.path);
                ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                    channel: msg.channel,
                    ref: msg.ref,
                    ok: {},
                    session: sessionId,
                })).finish());
            });
        }
        else if (msg.move) {
            fs.rename(msg.move.oldPath, msg.move.newPath, function (err) {
                // TODO: handle errors
                console.log("Renamed ".concat(msg.move.oldPath, " to ").concat(msg.move.newPath));
                ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                    channel: msg.channel,
                    ref: msg.ref,
                    ok: {},
                    session: sessionId,
                })).finish());
            });
        }
        else if (msg.mkdir) {
            fs.mkdir(msg.mkdir.path, function (err) {
                // TODO: handle errors
                ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                    channel: msg.channel,
                    ref: msg.ref,
                    ok: {},
                    session: sessionId,
                })).finish());
            });
        }
        else if (msg.fsSnapshot) {
            console.log('Taking snapshot');
            // TODO: actually finish this
            ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                channel: msg.channel,
                ref: msg.ref,
                ok: {},
                session: sessionId,
            })).finish());
        }
        else if (msg.resizeTerm) {
            if (channels[msg.channel].process && !(channels[msg.channel].process instanceof child_process_1.ChildProcess)) {
                channels[msg.channel].process.resize(msg.resizeTerm.cols, msg.resizeTerm.rows);
            }
        }
        else if (msg.input) {
            var proc = channels[msg.channel].process;
            if (proc) {
                if ((_f = proc.stdin) === null || _f === void 0 ? void 0 : _f.write) {
                    proc.stdin.write(msg.input);
                }
                else if (proc.write) {
                    proc.write(msg.input);
                }
                else {
                    console.warn('Warning: client tried to write to a channel without a writable process');
                }
            }
        }
        else if (msg.toolchainGetRequest) {
            ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                channel: msg.channel,
                ref: msg.ref,
                session: sessionId,
                toolchainGetResponse: {
                    configs: {
                        entrypoint: dotReplit.entrypoint || null,
                        runs: [
                            {
                                id: '.replit/run',
                                name: dotReplit.fullRunCommand,
                                fileTypeAttrs: {},
                            },
                        ],
                        languageServers: typeof dotReplit.languages == 'object'
                            ? Object.entries(dotReplit.languages).map(function (_a) {
                                var _b, _c;
                                var lang = _a[0], config = _a[1];
                                return ({
                                    id: ".replit/languageServer:".concat(lang),
                                    name: ((_b = config.languageServer) === null || _b === void 0 ? void 0 : _b.start) || null,
                                    language: lang,
                                    fileTypeAttrs: {
                                        filePattern: config.pattern || null,
                                    },
                                    config: {
                                        startCommand: {
                                            args: ((_c = config.languageServer) === null || _c === void 0 ? void 0 : _c.start)
                                                ? (0, cmdArgs_1.cmdStringToArgs)(config.languageServer.start)
                                                : null,
                                        },
                                    },
                                });
                            })
                            : [],
                    },
                },
            })).finish());
        }
        else if (msg.nixModulesGetRequest) {
            ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                channel: msg.channel,
                ref: msg.ref,
                session: sessionId,
                nixModulesGetResponse: {},
            })).finish());
        }
        else if (msg.runConfigGetRequest) {
            ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                channel: msg.channel,
                ref: msg.ref,
                session: sessionId,
                runConfigGetResponse: {
                    run: {
                        run: {
                            args: dotReplit.fullRunCommandArgs,
                        },
                    },
                },
            })).finish());
        }
        else if (msg.dotReplitGetRequest) {
            ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                channel: msg.channel,
                ref: msg.ref,
                session: sessionId,
                dotReplitGetResponse: {
                    dotReplit: __assign(__assign({}, dotReplit), { run: {
                            args: dotReplit.fullRunCommandArgs,
                        }, orderedEnv: typeof dotReplit.env == 'object'
                            ? Object.entries(dotReplit.env).map(function (entry) { return ({
                                key: entry[0],
                                value: entry[1],
                            }); })
                            : null }),
                },
            })).finish());
        }
        else if (msg.runMain) {
            console.log('Running');
            ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                channel: msg.channel,
                state: protocol_1.api.State.Running,
            })).finish());
            channels[msg.channel].process.kill();
            channels[msg.channel].showOutput = false;
            setTimeout(function () {
                channels[msg.channel].process.on('exit', function () {
                    console.log('Finished running');
                    ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                        channel: msg.channel,
                        state: protocol_1.api.State.Stopped,
                    })).finish());
                });
                channels[msg.channel].process.write("".concat(ansiClear).concat(dotReplit.fullRunCommand, "\rexit\r"));
                ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                    channel: msg.channel,
                    output: "".concat(dotReplit.run || dotReplitDefaultRunCommand, "\r"),
                })).finish());
                setTimeout(function () {
                    channels[msg.channel].showOutput = true;
                }, 10);
            }, 100);
        }
        else if (msg.clear) {
            channels[msg.channel].process.write(ansiClear);
        }
        else if (msg.chatMessage) {
            for (var _u = 0, _v = Object.values(sessions); _u < _v.length; _u++) {
                var wsIter = _v[_u].ws;
                wsIter.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                    channel: msg.channel,
                    session: -sessionId,
                    chatMessage: msg.chatMessage,
                })).finish());
            }
        }
        else if (msg.startLSP) {
            var id = msg.startLSP.languageServerId;
            // Assume ID starts in .replit
            if (!id.startsWith('.replit/')) {
                console.warn('Warning: client requested an LSP server on a dotReplit file that is not ".replit". This is unsupported');
                return;
            }
            var langMatch = id.match(/\/languageServer:(.+)$/);
            if (!langMatch) {
                console.warn('Warning: client sent an invalid LSP start request');
                return;
            }
            var lang = langMatch[1];
            var lspConfig = (_g = dotReplit.languages) === null || _g === void 0 ? void 0 : _g[lang];
            if (!lspConfig) {
                console.warn('Warning: client requested a non-configured LSP server');
                return;
            }
            var lspStartCmd = ((_h = lspConfig.languageServer) === null || _h === void 0 ? void 0 : _h.start) || null;
            if (!lspStartCmd) {
                console.warn('Warning: client requested an LSP server without a start command');
                return;
            }
            var lspStartCmdAllArgs = (0, cmdArgs_1.cmdStringToArgs)(lspStartCmd);
            var lspStartCmdName = lspStartCmdAllArgs[0];
            var lspStartCmdArgs = lspStartCmdAllArgs.slice(1);
            channels[msg.channel].process = (0, child_process_1.spawn)(lspStartCmdName, lspStartCmdArgs);
            channels[msg.channel].process.on('spawn', function () {
                ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                    channel: msg.channel,
                    ref: msg.ref,
                    session: sessionId,
                    ok: {},
                })).finish());
            });
            channels[msg.channel].process.on('data', function (data) {
                ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                    channel: msg.channel,
                    output: data.toString('utf-8'),
                })).finish());
            });
        }
        else if (msg.stat) {
            var path = (0, path_1.normalize)(msg.stat.path);
            fs.stat(path, function (err, stats) {
                if (err) {
                    if (err.code == 'ENOENT') {
                        ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                            channel: msg.channel,
                            ref: msg.ref,
                            session: sessionId,
                            statRes: {},
                        })).finish());
                    }
                    else {
                        ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                            channel: msg.channel,
                            ref: msg.ref,
                            session: sessionId,
                            error: err.toString(),
                        })).finish());
                    }
                    return;
                }
                ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
                    channel: msg.channel,
                    ref: msg.ref,
                    session: sessionId,
                    statRes: {
                        exists: true,
                        size: stats.size.toString(),
                        fileMode: (0, permissions_1.bitsToAscii)(stats.mode),
                        modTime: Math.floor(stats.mtimeMs / 1000).toString(),
                    },
                })).finish());
            });
        }
        else {
            console.dir(msg);
        }
    });
    var container = protocol_1.api.Command.create();
    container.containerState = new protocol_1.api.ContainerState();
    container.containerState.state = protocol_1.api.ContainerState.State.READY;
    ws.send(protocol_1.api.Command.encode(container).finish());
    ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
        channel: 0,
        bootStatus: {
            stage: protocol_1.api.BootStatus.Stage.COMPLETE,
        },
    })).finish());
    ws.send(protocol_1.api.Command.encode(protocol_1.api.Command.create({
        channel: 0,
        toast: {
            text: ((_a = dotReplit === null || dotReplit === void 0 ? void 0 : dotReplit.nodeval) === null || _a === void 0 ? void 0 : _a.connectToast) ||
                'Connecting to Nodeval... By @LuisAFK',
        },
    })).finish());
});
var checkDisconnectedClientsInterval = setInterval(function () {
    wss.clients.forEach(function (ws) {
        if (ws.isAlive === false) {
            return (ws.onDisconnected || ws.terminate)();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);
wss.on('close', function () {
    clearInterval(checkDisconnectedClientsInterval);
    console.log('Closing WebSocket server');
});
(0, checkCommand_1.checkCommandsInteractive)({
    rg: {
        required: false,
        name: 'RipGrep',
    },
    ag: {
        required: false,
        name: 'The Silver Searcher (ag)',
        url: 'https://geoff.greer.fm/ag/',
    },
});
setTimeout(function () {
    var nodevalUrl = "ws://127.0.0.1:".concat(port);
    process.stdout.write("Listening on ".concat(nodevalUrl));
    var copied = false;
    switch (platform) {
        case 'darwin':
            var copyNodevalUrlProcDarwin = (0, child_process_1.spawn)('pbcopy');
            copyNodevalUrlProcDarwin.stdin.end(nodevalUrl);
            copied = true;
            break;
        case 'win32':
            var copyNodevalUrlProcWin32 = (0, child_process_1.spawn)('clip');
            copyNodevalUrlProcWin32.stdin.end(nodevalUrl);
            copied = true;
            break;
    }
    if (copied) {
        process.stdout.write(' (copied to clipboard)');
    }
    console.log('');
}, 100);
setInterval(function () {
    fs.writeFile('.file-history.json', JSON.stringify(fileHistory, null, 2), 'utf-8', function () { });
}, 5000);
