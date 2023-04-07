const { makeConsoleSafe } = require('safe-logging-replit');
makeConsoleSafe(console);

const package = require('./package.json');
const os = require('os');
const osUtils = require('os-utils');
const { WebSocketServer } = require('ws');
const { api } = require('@replit/protocol');
const { exec, spawn, execSync } = require('child_process');
const { spawn: spawnPty } = require('node-pty');
const { query } = require('replit-graphql');
const { applyOTs, diffsToOTs } = require('./ot');
const disk = require('diskusage');
const fs = require('fs');
const dotenv = require('dotenv');
const crc32 = require('crc/crc32');
const { normalize: normalizePath } = require('path');
const { parse: parseToml } = require('toml');
const { diffChars } = require('diff');
const minimatch = require('minimatch');

dotenv.config();

const platform = os.platform();

const port = parseInt(process.env.NODEVAL_PORT) || 4096;
const shell =
  process.env.NODEVAL_SHELL ||
  (platform == 'win32' ? 'powershell.exe' : 'bash');
const nodevalReplId = process.env.NODEVAL_REPL_ID || null;

if (!nodevalReplId) {
  console.warn(
    'Warning: no Nodeval Repl ID specified. All Repls will be passed to Nodeval.'
  );
}

// TODO: if the user connects from a Repl that isn't nodevalReplId, proxy to normal Replit Goval

process.on('uncaughtException', (err) => {
  if (err.code == 'EADDRINUSE') {
    console.error(
      'Port',
      port,
      `is already in use. Try running the following to kill the process using it:\nkill -15 \`sudo lsof -i :${port} | tail -n +2 | awk \'{ print $2 }\'\``
    );
    process.exit(4);
  } else {
    throw err;
  }

  process.exit(3);
});

const wss = new WebSocketServer({ port });

let lastSessId = 1;
let replId = nodevalReplId;
let replUrl = null;

// Create .env
fs.writeFile('.env', '', { flag: 'wx' }, () => {});

// Create .replit
fs.writeFile('.replit', '', { flag: 'wx' }, () => {});

// Create file history file
try {
  fs.writeFileSync('.file-history.json', '{}', { flag: 'wx' });
} catch {}

// dotReplit config
let dotReplit = {};

const dotReplitDefaultRunCommand =
  "echo Run isn't configured. Try adding a .replit and configuring it https://docs.replit.com/programming-ide/configuring-run-button";

function loadDotReplit() {
  return new Promise((resolve, reject) => {
    fs.readFile('.replit', 'utf-8', (err, data) => {
      if (err) {
        console.error('Error reading .replit:', err);
        reject(err);
        return;
      }

      try {
        dotReplit = parseToml(data);
      } catch (err) {
        console.error('Error parsing .replit:', err);
        reject(err);
        return;
      }

      dotReplit.fullRunCommand = `sh -c '${escapeQuotes(
        dotReplit.run || dotReplitDefaultRunCommand
      )}'`;

      dotReplit.fullRunCommandArgs = [
        'sh',
        '-c',
        `'${escapeQuotes(dotReplit.run || dotReplitDefaultRunCommand)}'`,
      ];

      resolve(dotReplit);
    });
  });
}

loadDotReplit().then(() => {
  console.debug('Loaded dotReplit');
});
setInterval(loadDotReplit, 5000);

// Get current TTY
let currentTty = null;

try {
  currentTty = execSync('tty', {
    stdio: ['inherit', 'pipe', 'pipe'],
  })
    .toString()
    .trim();
} catch (err) {
  console.error('Error getting current TTY:', err);
}

// ANSI codes to clear the screen
const ansiClear = '\033[H\033[J\r';

function randomStr() {
  return Math.random().toString(36).substring(2);
}

function escapeQuotes(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function startPty(sessionId, chanId, ws, infoCallback) {
  const [replId, username, userId, replUrl] = infoCallback();
  const channels = sessions[sessionId].channels;

  channels[chanId].processPtyDev = null;

  if (typeof channels[chanId].showOutput != 'boolean') {
    channels[chanId].showOutput = true;
  }

  channels[chanId].process = spawnPty(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...dotReplit.env,
      PATH: `${__dirname}/bin:${process.env.PATH}`,
      NODEVAL_TTY: currentTty || '',
      NODEVAL_PID: process.pid,
      GOVAL_SESSION: sessionId,
      GOVAL_VERSION: `${package.name}-${package.version}`,
      PS1: '\\[\\e[0;1;38;5;33m\\]\\u\\[\\e[0;2m\\]@\\[\\e[0;1;38;5;34m\\]\\h\\[\\e[0;2m\\] - \\[\\e[0;3;38;5;227m\\]\\W\\[\\e[0;2;3m\\]: \\[\\e[0m\\]',
      REPL_ID: replId,
      REPL_OWNER: username,
      REPL_OWNER_ID: userId,
      REPL_URL: replUrl,
    },
  });

  channels[chanId].process.on('data', (output) => {
    if (channels[chanId].processPtyDev) {
      if (channels[chanId].showOutput) {
        ws.send(
          api.Command.encode(
            new api.Command({
              channel: chanId,
              output,
            })
          ).finish()
        );

        if (channels[chanId].openChan.service == 'shellrun2') {
          ws.send(
            api.Command.encode(
              new api.Command({
                channel: chanId,
                record: output,
              })
            ).finish()
          );
        }
      }
    } else {
      const match = output.match(/^ptyDev:(.+?):ptyDev/m);

      if (match) {
        channels[chanId].processPtyDev = match[1];
      }

      console.log('Spawned shell:', channels[chanId].processPtyDev);
    }
  });

  setTimeout(() => {
    channels[chanId].process.write('echo -n "ptyDev:"`tty`":ptyDev"\r');
  }, 10);

  channels[chanId].process.on('exit', () => {
    console.log('Shell exited, respawning...');

    startPty(...arguments);
  });
}

function makeTimestamp(now = null) {
  now = now || Date.now();
  return {
    seconds: Math.floor(now / 1000).toString(),
    nanos: 0,
  };
}

// Import previous file history
const fileHistory = require('./.file-history.json');

// Session to WS map
const sessions = {};

wss.on('connection', (ws) => {
  ws.isAlive = true;

  console.log('Client connecting...');

  const channels = {};
  let lastChanId = 0;

  let userId = null;
  let username = null;
  const sessionId = ++lastSessId;

  let activeFile = null;
  let sentJoinEvent = false;

  sessions[sessionId] = {
    ws,
    channels,
    userId,
    username,
    activeFile,
  };

  ws.onDisconnected = () => {
    console.log(
      'Client disconnected: user ID',
      userId,
      `aka "@${username}", session ID`,
      sessionId
    );

    delete sessions[sessionId];

    // Send leave event to all other sessions
    for (const { channels, ws: wsIter } of Object.values(sessions)) {
      for (const [chanId, channel] of Object.entries(channels)) {
        if (channel.openChan.service != 'presence') {
          continue;
        }

        wsIter.send(
          api.Command.encode(
            new api.Command({
              channel: chanId,
              session: -sessionId,
              part: {
                id: userId,
                session: sessionId,
                name: username,
              },
            })
          ).finish()
        );
      }
    }
  };

  ws.on('close', ws.onDisconnected);

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (msg) => {
    msg = api.Command.decode(msg);

    if (msg.channel) {
      msg._service = channels[msg.channel].openChan.service;
      msg._chanName = channels[msg.channel].openChan.name;
    }

    if (msg.ping) {
      ws.send(
        api.Command.encode(
          new api.Command({
            channel: 0,
            ref: msg.ref,
            pong: {},
          })
        ).finish()
      );
    } else if (msg.openChan && msg.openChan.service) {
      console.debug(
        `Opening channel "${msg.openChan.name}"\twith service "${msg.openChan.service}": ${msg.openChan.action}`
      );

      const chanId = ++lastChanId;

      channels[chanId] = {
        openChan: msg.openChan,
      };

      // TODO: use msg.openChan.action (CREATE|ATTACH|ATTACH_OR_CREATE)

      switch (msg.openChan.service) {
        case 'fsevents':
          channels[chanId].subscriptions = {};
          break;

        case 'shell':
        case 'shellrun2':
          startPty(sessionId, chanId, ws, () => {
            return [replId, username, userId, replUrl];
          });

          if (msg.openChan.service == 'shellrun2') {
            setTimeout(() => {
              ws.send(
                api.Command.encode(
                  new api.Command({
                    channel: chanId,
                    state: api.State.Stopped,
                  })
                ).finish()
              );
            }, 10);
          }

          break;

        case 'ot':
          channels[chanId].subscriptions = {};
          channels[chanId].otstatus = {
            content: '',
            version: 0,
            linkedFile: null,
            cursors: [],
          };
          setTimeout(() => {
            ws.send(
              api.Command.encode(
                new api.Command({
                  channel: chanId,
                  ref: msg.ref,
                  otstatus: channels[chanId].otstatus,
                })
              ).finish()
            );
          }, 10);
          break;

        case 'presence':
          setTimeout(() => {
            ws.send(
              api.Command.encode(
                new api.Command({
                  channel: chanId,
                  session: sessionId,
                  roster: {
                    user: Object.entries(sessions).map((entry) => ({
                      id: entry[1].userId,
                      name: entry[1].username,
                      session: entry[0],
                    })),
                    files: Object.entries(sessions).map((entry) => ({
                      file: entry[1].activeFile,
                      userId: entry[1].userId,
                      session: entry[0],
                      timestamp: makeTimestamp(),
                    })),
                  },
                })
              ).finish()
            );
          }, 10);
          break;
      }

      ws.send(
        api.Command.encode(
          new api.OpenChannelRes({
            channel: 0,
            ref: msg.ref,
            openChanRes: {
              id: chanId,
            },
            session: sessionId,
          })
        ).finish()
      );
    } else if (msg.closeChan) {
      switch (msg._service) {
        case 'ot':
          if (channels[msg.closeChan.id].subscriptions) {
            for (const [path, watcher] of Object.entries(
              channels[msg.closeChan.id].subscriptions
            )) {
              watcher.close();
            }
          }
          break;
      }

      // TODO: use msg.closeChan.action (DISCONNECT|CLOSE|TRY_CLOSE)
      delete channels[msg.closeChan.id];

      console.log(
        'Closing channel ID',
        msg.closeChan.id,
        `with service "${msg._service}":`,
        msg.closeChan.action
      );

      ws.send(
        api.Command.encode(
          new api.CloseChannelRes({
            channel: 0,
            ref: msg.ref,
            closeChanRes: {
              id: msg.closeChan.id,
              status: api.CloseChannelRes.Status.CLOSE,
            },
          })
        ).finish()
      );
    } else if (msg.userEvent) {
      if (
        msg.userEvent.eventName == 'meta:ready' ||
        msg.userEvent.eventName == 'meta:start'
      ) {
        replId = msg.userEvent.eventData.fields.replId.stringValue;
        replUrl = msg.userEvent.eventData.fields.url.stringValue;
        userId = msg.userEvent.eventData.fields.userId.numberValue;

        sessions[sessionId].userId = userId;

        // Get username
        query('query user($id: Int!) { user(id: $id) { username } }', {
          id: userId,
        }).then((res) => {
          username = res.data.user.username;
          sessions[sessionId].username = username;

          console.log(
            'Client is',
            msg.userEvent.eventName == 'meta:ready' ? 'ready' : 'starting',
            'user ID',
            userId,
            `aka "@${username}", session ID`,
            sessionId
          );

          if (!sentJoinEvent) {
            sentJoinEvent = true;

            // Send join event to all other sessions
            for (const { channels, ws: wsIter } of Object.values(sessions)) {
              for (const [chanId, channel] of Object.entries(channels)) {
                if (channel.openChan.service != 'presence') {
                  continue;
                }

                wsIter.send(
                  api.Command.encode(
                    new api.Command({
                      channel: chanId,
                      session: -sessionId,
                      join: {
                        id: userId,
                        session: sessionId,
                        name: username,
                      },
                    })
                  ).finish()
                );
              }
            }
          }
        });
      } else if (
        msg.userEvent.eventName == 'user:run:output' ||
        msg.userEvent.eventName.startsWith('user:shell:')
      ) {
        // ignore
      } else {
        console.log(
          `Received user event "${msg.userEvent.eventName}":`,
          msg.userEvent.eventData
        );
      }
    } else if (msg.exec) {
      if (
        msg.exec.args[0] == 'bash' &&
        msg.exec.args[1] == '-c' &&
        msg.exec.args[2] ==
          "date '+%s%N' && cat /sys/fs/cgroup/cpu/cpuacct.usage /sys/fs/cgroup/cpu/cpu.cfs_quota_us /sys/fs/cgroup/cpu/cpu.cfs_period_us /sys/fs/cgroup/memory/memory.usage_in_bytes /sys/fs/cgroup/memory/memory.soft_limit_in_bytes /sys/fs/cgroup/memory/memory.limit_in_bytes &&grep '^\\(total_rss\\|total_cache\\) ' /sys/fs/cgroup/memory/memory.stat"
      ) {
        ws.send(
          api.Command.encode(
            new api.Command({
              channel: msg.channel,
              state: api.State.Running,
            })
          ).finish()
        );

        osUtils.cpuUsage((cpuUsagePercent) => {
          const freeMemory = osUtils.freemem();
          const totalMemory = osUtils.totalmem();
          const memoryUsage = totalMemory - freeMemory;
          const cpuTime = process.cpuUsage();

          ws.send(
            api.Command.encode(
              new api.Command({
                channel: msg.channel,
                ref: msg.ref,
                output: `${Date.now() * 1000000}\n${
                  cpuTime.system * 1000
                }\n200000\n100000\n${memoryUsage}\n${totalMemory}\n${totalMemory}\ntotal_cache 36864\ntotal_rss ${totalMemory}`,
              })
            ).finish()
          );

          setTimeout(() => {
            ws.send(
              api.Command.encode(
                new api.Command({
                  channel: msg.channel,
                  state: api.State.Stopped,
                })
              ).finish()
            );
          }, 10);
        });
      } else if (
        msg.exec.args[0] == 'bash' &&
        msg.exec.args[1] == '-c' &&
        msg.exec.args[2] ==
          'cat /repl/stats/subvolume_usage_bytes /repl/stats/subvolume_total_bytes'
      ) {
        ws.send(
          api.Command.encode(
            new api.Command({
              channel: msg.channel,
              state: api.State.Running,
            })
          ).finish()
        );

        disk.check('.', (err, diskUsage) => {
          // TODO: handle errors

          ws.send(
            api.Command.encode(
              new api.Command({
                channel: msg.channel,
                output: `${diskUsage.total - diskUsage.free}\n${
                  diskUsage.total
                }\n`,
              })
            ).finish()
          );

          setTimeout(() => {
            ws.send(
              api.Command.encode(
                new api.Command({
                  channel: msg.channel,
                  ref: msg.ref,
                  ok: {},
                })
              ).finish()
            );

            setTimeout(() => {
              ws.send(
                api.Command.encode(
                  new api.Command({
                    channel: msg.channel,
                    state: api.State.Stopped,
                  })
                ).finish()
              );
            }, 10);
          }, 10);
        });
      } else {
        const cmd = msg.exec.args
          .map((s) => {
            // Escape quotes and escapes
            s = s.replace(/("|\\)/g, '\\$1');

            // Wrap in quotes
            s = `"${s}"`;

            return s;
          })
          .join(' ');

        ws.send(
          api.Command.encode(
            new api.Command({
              channel: msg.channel,
              state: api.State.Running,
            })
          ).finish()
        );

        // Run the command
        exec(
          cmd,
          {
            env: msg.exec.env || process.env,
          },
          (error, stdout, stderr) => {
            ws.send(
              api.Command.encode(
                new api.Command({
                  channel: msg.channel,
                  ref: msg.ref,
                  output: stdout,
                })
              ).finish()
            );

            const res = stderr.trim()
              ? {
                  error: stderr,
                }
              : {
                  ok: {},
                };
            ws.send(
              api.Command.encode(
                new api.Command({
                  channel: msg.channel,
                  ref: msg.ref,
                  ...res,
                })
              ).finish()
            );

            setTimeout(() => {
              ws.send(
                api.Command.encode(
                  new api.Command({
                    channel: msg.channel,
                    state: api.State.Stopped,
                  })
                ).finish()
              );
            }, 10);
          }
        );
      }
    } else if (msg.readdir) {
      fs.readdir(
        msg.readdir.path,
        {
          withFileTypes: true,
        },
        (err, files) => {
          ws.send(
            api.Command.encode(
              new api.Command({
                channel: msg.channel,
                ref: msg.ref,
                files: {
                  files:
                    files
                      ?.filter((file) => {
                        if (!dotReplit?.nodeval?.inaccessibleFiles) {
                          return true;
                        }

                        let matched = false;
                        for (const glob of dotReplit.nodeval
                          .inaccessibleFiles) {
                          matched = minimatch(file.name, glob, {
                            matchBase: true,
                          });

                          if (matched) {
                            break;
                          }
                        }

                        return !matched;
                      })
                      .map((file) => ({
                        path: file.name,
                        type: file.isDirectory()
                          ? api.File.Type.DIRECTORY
                          : api.File.Type.REGULAR,
                      })) || [],
                },
              })
            ).finish()
          );
        }
      );
    } else if (msg.subscribeFile) {
      for (let file of msg.subscribeFile.files) {
        file = file.path;

        if (file in channels[msg.channel].subscriptions) {
          ws.send(
            api.Command.encode(
              new api.Command({
                channel: msg.channel,
                ref: msg.ref,
                ok: {},
              })
            ).finish()
          );
        } else {
          try {
            channels[msg.channel].subscriptions[file] = fs.watch(
              file,
              (e, filename) => {
                if (e == 'rename') {
                  ws.send(
                    api.Command.encode(
                      new api.Command({
                        channel: msg.channel,
                        fileEvent: {
                          file: {
                            path: file,
                          },
                        },
                      })
                    ).finish()
                  );
                }
              }
            );

            ws.send(
              api.Command.encode(
                new api.Command({
                  channel: msg.channel,
                  ref: msg.ref,
                  ok: {},
                })
              ).finish()
            );
          } catch (err) {
            ws.send(
              api.Command.encode(
                new api.Command({
                  channel: msg.channel,
                  ref: msg.ref,
                  error: `unable to subscribe file from fsevents: ${err.message}`,
                })
              ).finish()
            );
          }
        }
      }

      ws.send(
        api.Command.encode(
          new api.Command({
            channel: msg.channel,
            ref: msg.ref,
            ok: {},
          })
        ).finish()
      );
    } else if (msg.openFile) {
      const path = msg.openFile.file ? normalizePath(msg.openFile.file) : null;

      activeFile = path;
      sessions[sessionId].activeFile = activeFile;

      console.debug('User', username, 'opened file:', path, '(presence)');

      const timestamp = makeTimestamp();

      for (const { channels, ws: wsIter } of Object.values(sessions)) {
        for (const [chanId, channel] of Object.entries(channels)) {
          if (channel.openChan.service != 'presence') {
            continue;
          }

          wsIter.send(
            api.Command.encode(
              new api.Command({
                channel: chanId,
                session: -sessionId,
                fileOpened: {
                  file: activeFile,
                  userId,
                  session: sessionId,
                  timestamp,
                },
              })
            ).finish()
          );
        }
      }
    } else if (msg.followUser) {
      console.debug(
        `@${username} following @${sessions[msg.followUser.session].username}`
      );
      sessions[msg.followUser.session].ws.send(
        api.Command.encode(
          new api.Command({
            channel: msg.channel,
            session: msg.followUser.session,
            followUser: {
              session: sessionId,
            },
          })
        ).finish()
      );
    } else if (msg.unfollowUser) {
      console.debug(
        `@${username} unfollowing @${
          sessions[msg.unfollowUser.session].username
        }`
      );
      sessions[msg.unfollowUser.session].ws.send(
        api.Command.encode(
          new api.Command({
            channel: msg.channel,
            session: msg.unfollowUser.session,
            unfollowUser: {
              session: sessionId,
            },
          })
        ).finish()
      );
    } else if (/*msg.otLinkFile?.file.path || */ msg.read) {
      const file = msg.otLinkFile?.file.path || msg.read.path;

      fs.readFile(file, (err, data) => {
        if (err) {
          if (err.code == 'ENOENT') {
            ws.send(
              api.Command.encode(
                new api.Command({
                  channel: msg.channel,
                  ref: msg.ref,
                  session: sessionId,
                  error: `unable to read file content from gcsfiles: open ${file}: no such file or directory`,
                })
              ).finish()
            );
          } else {
            ws.send(
              api.Command.encode(
                new api.Command({
                  channel: msg.channel,
                  ref: msg.ref,
                  session: sessionId,
                  error: `unable to read file content from gcsfiles: ${err.message}`,
                })
              ).finish()
            );
          }
        } else {
          const bdata = data.toString('base64');

          const res = msg.otLinkFile
            ? {
                otLinkFileResponse: {
                  version: 1,
                  linkedFile: {
                    path: file,
                    content: bdata,
                  },
                },
              }
            : {
                file: {
                  path: file,
                  content: bdata,
                },
              };

          const constr = msg.otLinkFile ? api.OTLinkFileResponse : api.Command;

          ws.send(
            api.Command.encode(
              new constr({
                channel: msg.channel,
                ref: msg.ref,
                session: sessionId,
                ...res,
              })
            ).finish()
          );
        }
      });
    } else if (msg.write) {
      const content = msg.write.content || '';

      fs.writeFile(msg.write.path, msg.write.content, (err) => {
        if (err) {
          ws.send(
            api.Command.encode(
              new api.Command({
                channel: msg.channel,
                ref: msg.ref,
                error: `unable to write file content from gcsfiles: ${err.message}`,
              })
            ).finish()
          );
        } else {
          ws.send(
            api.Command.encode(
              new api.Command({
                channel: msg.channel,
                ref: msg.ref,
                ok: {},
              })
            ).finish()
          );
        }
      });
    } else if (msg.otLinkFile) {
      if (channels[msg.channel].otstatus) {
        const path = normalizePath(msg.otLinkFile.file.path);

        fs.readFile(path, (err, data) => {
          if (err) {
            ws.send(
              api.Command.encode(
                new api.Command({
                  channel: msg.channel,
                  ref: msg.ref,
                  error: `unable to read file content from ot: open ${path}: no such file or directory`,
                })
              ).finish()
            );
            return;
          }

          const now = Date.now();

          if (!fileHistory[path]) {
            fileHistory[path] = {
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
                  userId,
                },
              ],
            };

            console.log('Created initial version of', path);
          }

          channels[msg.channel].otstatus.linkedFile = path;
          channels[msg.channel].otstatus.version =
            fileHistory[path].versions.length;

          ws.send(
            api.Command.encode(
              new api.Command({
                channel: msg.channel,
                ref: msg.ref,
                session: sessionId,
                otLinkFileResponse: {
                  version: fileHistory[path].versions.length,
                  linkedFile: {
                    path: path,
                    content: data.toString('base64'),
                  },
                },
              })
            ).finish()
          );
          setTimeout(() => {
            ws.send(
              api.Command.encode(
                new api.Command({
                  channel: msg.channel,
                  ref: msg.ref,
                  ok: {},
                })
              ).finish()
            );
          }, 10);

          let watcher = null;
          watcher = fs.watch(path, (e, filename) => {
            if (!channels[msg.channel]) {
              watcher.close();
              return;
            }

            if (e == 'change') {
              // Check if change is because of flushing OTs
              if (!channels[msg.channel].flushing) {
                const cursorId = randomStr();
                const cursor = {
                  position: 0,
                  selectionStart: 0,
                  selectionEnd: 0,
                  user: {
                    name: 'replit',
                  },
                  id: cursorId,
                };

                channels[msg.channel].otstatus.cursors.push(cursor);

                ws.send(
                  api.Command.encode(
                    new api.Command({
                      channel: msg.channel,
                      otNewCursor: cursor,
                    })
                  ).finish()
                );

                // Get old file contents
                let oldContents = '';

                for (const version of fileHistory[path].versions) {
                  oldContents = applyOTs(oldContents, version.op).file;
                }

                // TODO: iterate over versions and apply individually

                // Get new file contents
                fs.readFile(path, 'utf-8', (err, newContents) => {
                  // TODO: handle errors

                  // Check if there were changes
                  if (oldContents == newContents) {
                    return;
                  }

                  // Get file changes as OTs
                  const ots = diffsToOTs(diffChars(oldContents, newContents));

                  const newVersion = fileHistory[path].versions.length + 1;

                  // Construct OT packet
                  const packet = {
                    spookyVersion: newVersion,
                    op: ots,
                    crc32: crc32(newContents),
                    comitted: makeTimestamp(now),
                    version: newVersion,
                  };

                  // Send to client
                  ws.send(
                    api.Command.encode(
                      new api.Command({
                        channel: msg.channel,
                        ot: packet,
                      })
                    ).finish()
                  );

                  // Save to file history
                  fileHistory[path].versions.push(packet);
                });
              }
            }
          });
          channels[msg.channel].subscriptions[path] = watcher;
        });
      }
    } else if (msg.otNewCursor) {
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
    } else if (msg.otDeleteCursor) {
      if (channels[msg.channel].otstatus) {
        channels[msg.channel].otstatus.cursors = channels[
          msg.channel
        ].otstatus.cursors.filter(
          (cursor) => cursor.id != msg.otDeleteCursor.id
        );
      }
    } else if (msg.ot) {
      const file =
        normalizePath(channels[msg.channel].otstatus?.linkedFile) || null;

      if (file) {
        fs.readFile(file, 'utf-8', (err, data) => {
          // TODO: handle errors

          try {
            const newFile = applyOTs(data, msg.ot.op, 0, true);
            const now = Date.now();

            const newVersion = fileHistory[file].versions.length + 1;

            const packet = {
              spookyVersion: newVersion,
              op: msg.ot.op,
              crc32: crc32(newFile.file),
              comitted: makeTimestamp(now),
              version: newVersion,
              userId,
            };

            fileHistory[file].versions.push(packet);

            ws.send(
              api.Command.encode(
                new api.Command({
                  channel: msg.channel,
                  ref: msg.ref,
                  session: sessionId,
                  ot: packet,
                })
              ).finish()
            );

            // Prevent the watch file handler from
            // otLinkFile from firing
            channels[msg.channel].flushing = true;

            fs.writeFile(file, newFile.file, 'utf-8', (err) => {
              // TODO: handle errors
              // TODO: only flush when needed
              console.debug('Flushed OTs');

              setTimeout(() => {
                if (channels[msg.channel]) {
                  channels[msg.channel].flushing = false;
                }
              }, 100);
            });

            setTimeout(() => {
              ws.send(
                api.Command.encode(
                  new api.Command({
                    channel: msg.channel,
                    ref: msg.ref,
                    session: sessionId,
                    ok: {},
                  })
                ).finish()
              );
            }, 10);
          } catch (err) {
            ws.send(
              api.Command.encode(
                new api.Command({
                  channel: msg.channel,
                  ref: msg.ref,
                  session: sessionId,
                  error: err.message,
                })
              ).finish()
            );
          }
        });
      }
    } else if (msg.otFetchRequest) {
      // TODO: don't ignore versionFrom and versionTo

      const path = normalizePath(channels[msg.channel].otstatus?.linkedFile);

      console.log(
        'Got',
        fileHistory[path].versions.length,
        'versions from file history'
      );

      ws.send(
        api.Command.encode(
          new api.Command({
            channel: msg.channel,
            ref: msg.ref,
            session: sessionId,
            otFetchResponse: {
              packets: fileHistory[path].versions,
            },
          })
        ).finish()
      );
    } else if (msg.flush) {
      // TODO: flusing now instead of on every OT

      ws.send(
        api.Command.encode(
          new api.Command({
            channel: msg.channel,
            ref: msg.ref,
            session: sessionId,
            ok: {},
          })
        ).finish()
      );
    } else if (msg.remove) {
      fs.rm(
        msg.remove.path,
        {
          force: true,
          recursive: true,
        },
        (err) => {
          // TODO: handle errors

          console.log('Removed file', msg.remove.path);

          ws.send(
            api.Command.encode(
              new api.Command({
                channel: msg.channel,
                ref: msg.ref,
                ok: {},
                session: sessionId,
              })
            ).finish()
          );
        }
      );
    } else if (msg.move) {
      fs.rename(msg.move.oldPath, msg.move.newPath, (err) => {
        // TODO: handle errors

        console.log(`Renamed ${msg.move.oldPath} to ${msg.move.newPath}`);

        ws.send(
          api.Command.encode(
            new api.Command({
              channel: msg.channel,
              ref: msg.ref,
              ok: {},
              session: sessionId,
            })
          ).finish()
        );
      });
    } else if (msg.mkdir) {
      fs.mkdir(msg.mkdir.path, (err) => {
        // TODO: handle errors

        ws.send(
          api.Command.encode(
            new api.Command({
              channel: msg.channel,
              ref: msg.ref,
              ok: {},
              session: sessionId,
            })
          ).finish()
        );
      });
    } else if (msg.fsSnapshot) {
      console.log('Taking snapshot');

      // TODO: actually finish this

      ws.send(
        api.Command.encode(
          new api.Command({
            channel: msg.channel,
            ref: msg.ref,
            ok: {},
            session: sessionId,
          })
        ).finish()
      );
    } else if (msg.resizeTerm) {
      if (channels[msg.channel].process) {
        channels[msg.channel].process.resize(
          msg.resizeTerm.cols,
          msg.resizeTerm.rows
        );
      }
    } else if (msg.input) {
      const proc = channels[msg.channel].process;

      if (proc) {
        proc.write(msg.input);
      }
    } else if (msg.toolchainGetRequest) {
      ws.send(
        api.Command.encode(
          new api.Command({
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
              },
            },
          })
        ).finish()
      );
    } else if (msg.nixModulesGetRequest) {
      ws.send(
        api.Command.encode(
          new api.Command({
            channel: msg.channel,
            ref: msg.ref,
            session: sessionId,
            nixModulesGetResponse: {},
          })
        ).finish()
      );
    } else if (msg.runConfigGetRequest) {
      ws.send(
        api.Command.encode(
          new api.Command({
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
          })
        ).finish()
      );
    } else if (msg.dotReplitGetRequest) {
      ws.send(
        api.Command.encode(
          new api.Command({
            channel: msg.channel,
            ref: msg.ref,
            session: sessionId,
            dotReplitGetResponse: {
              dotReplit: {
                ...dotReplit,
                run: {
                  args: dotReplit.fullRunCommandArgs,
                },
                orderedEnv:
                  typeof dotReplit.env == 'object'
                    ? Object.entries(dotReplit.env).map((entry) => ({
                        key: entry[0],
                        value: entry[1],
                      }))
                    : null,
              },
            },
          })
        ).finish()
      );
    } else if (msg.runMain) {
      console.log('Running');

      ws.send(
        api.Command.encode(
          new api.Command({
            channel: msg.channel,
            state: api.State.Running,
          })
        ).finish()
      );

      channels[msg.channel].process.kill();
      channels[msg.channel].showOutput = false;

      setTimeout(() => {
        channels[msg.channel].process.on('exit', () => {
          console.log('Finished running');

          ws.send(
            api.Command.encode(
              new api.Command({
                channel: msg.channel,
                state: api.State.Stopped,
              })
            ).finish()
          );
        });

        channels[msg.channel].process.write(
          `${ansiClear}${dotReplit.fullRunCommand}\rexit\r`
        );

        ws.send(
          api.Command.encode(
            new api.Command({
              channel: msg.channel,
              output: `${dotReplit.run || dotReplitDefaultRunCommand}\r`,
            })
          ).finish()
        );

        setTimeout(() => {
          channels[msg.channel].showOutput = true;
        }, 10);
      }, 100);
    } else if (msg.clear) {
      channels[msg.channel].process.write(ansiClear);
    } else if (msg.chatMessage) {
      for (const { ws: wsIter } of Object.values(sessions)) {
        wsIter.send(
          api.Command.encode(
            new api.Command({
              channel: msg.channel,
              session: -sessionId,
              chatMessage: msg.chatMessage,
            })
          ).finish()
        );
      }
    } else {
      console.dir(msg);
    }
  });

  const container = new api.Command();
  container.containerState = new api.ContainerState();
  container.containerState.state = api.ContainerState.State.READY;

  ws.send(api.Command.encode(container).finish());

  ws.send(
    api.Command.encode(
      new api.Command({
        channel: 0,
        bootStatus: {
          stage: api.BootStatus.Stage.COMPLETE,
        },
      })
    ).finish()
  );

  ws.send(
    api.Command.encode(
      new api.Command({
        channel: 0,
        toast: {
          text:
            dotReplit?.nodeval?.connectToast ||
            'Connecting to Nodeval... By @LuisAFK',
        },
      })
    ).finish()
  );
});

const checkDisconnectedClientsInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      return (ws.onDisconnected || ws.terminate)();
    }

    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(checkDisconnectedClientsInterval);
  console.log('Closing WebSocket server');
});

setTimeout(() => {
  const nodevalUrl = `ws://127.0.0.1:${port}`;
  process.stdout.write(`Listening on ${nodevalUrl}`);

  let copied = false;

  switch (platform) {
    case 'darwin':
      const copyNodevalUrlProcDarwin = spawn('pbcopy');
      copyNodevalUrlProcDarwin.stdin.end(nodevalUrl);
      copied = true;
      break;

    case 'win32':
      const copyNodevalUrlProcWin32 = spawn('clip');
      copyNodevalUrlProcWin32.stdin.end(nodevalUrl);
      copied = true;
      break;
  }

  if (copied) {
    process.stdout.write(' (copied to clipboard)');
  }

  console.log('');
}, 100);

setInterval(() => {
  fs.writeFile(
    '.file-history.json',
    JSON.stringify(fileHistory, null, 2),
    'utf-8',
    () => {}
  );
}, 5000);
