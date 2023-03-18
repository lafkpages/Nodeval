const os = require('os');
const { WebSocketServer } = require("ws");
const { api } = require("@replit/protocol");
const { exec, spawn } = require('child_process');
const { spawn: spawnPty } = require('node-pty');
const { query, mutate, setSid } = require('replit-graphql');
const { applyOTs } = require('./ot');
const disk = require('diskusage');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

const platform = os.platform();

const port = parseInt(process.env.NODEVAL_PORT) || 4096;
const shell = process.env.NODEVAL_SHELL || (platform == 'win32'? 'powershell.exe' : 'bash');
const nodevalReplId = process.env.NODEVAL_REPL_ID || null;

if (!nodevalReplId) {
  console.warn('Warning: no Nodeval Repl ID specified. All Repls will be passed to Nodeval.');
}

// TODO: if the user connects from a Repl that isn't nodevalReplId, proxy to normal Replit Goval

process.on('uncaughtException', err => {
  if (err.code == 'EADDRINUSE') {
    console.error('Port', port, `is already in use. Try running the following to kill the process using it:\nkill -15 \`sudo lsof -i :${port} | tail -n +2 | awk \'{ print $2 }\'\``);
    process.exit(4);
  } else {
    throw err;
  }

  process.exit(3);
});

const wss = new WebSocketServer({ port });

const channels = {};
let lastChanId = 0;
let lastSessId = 1;

// Create .env
fs.writeFile('.env', '', { flag: 'wx' }, () => {});

wss.on('connection', ws => {
  ws.isAlive = true;

  console.log('Client connecting...');

  let replId = null;
  let replUrl = null;
  let userId = null;
  let username = null;
  const sessionId = ++lastSessId;

  ws.onDisconnected = () => {
    console.log('Client disconnected: user ID', userId, `aka "@${username}", session ID`, sessionId);

    // Close all channels if no one else is here
    // TODO
  };

  ws.on('close', ws.onDisconnected);

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on("message", msg => {
    msg = api.Command.decode(msg);

    if (msg.channel) {
      msg._service = channels[msg.channel].openChan.service;
      msg._chanName = channels[msg.channel].openChan.name;
    }

    if (msg.ping) {
      ws.send(api.Command.encode(new api.Command({
        channel: 0,
        ref: msg.ref,
        pong: {}
      })).finish());
    } else if (msg.openChan && msg.openChan.service) {
      console.debug(`Opening channel "${msg.openChan.name}"\twith service "${msg.openChan.service}": ${msg.openChan.action}`);

      const chanId = ++lastChanId;

      channels[chanId] = {
        openChan: msg.openChan
      };

      // TODO: use msg.openChan.action (CREATE|ATTACH|ATTACH_OR_CREATE)

      switch (msg.openChan.service) {
        case 'fsevents':
          channels[chanId].subscriptions = {};
          break;

        case 'shell':
        // case 'shellrun':
        // case 'shellrun2':
          channels[chanId].process = spawnPty(shell, [], {
            name: 'xterm-256color',
            cols: 80,
            rows: 24,
            cwd: process.cwd(),
            env: {
              ...process.env,
              NODEVAL_SHELL: '1',
              PS1: '\\[\\e[0;1;38;5;33m\\]\\u\\[\\e[0;2m\\]@\\[\\e[0;1;38;5;34m\\]\\h\\[\\e[0;2m\\] - \\[\\e[0;3;38;5;227m\\]\\W\\[\\e[0;2;3m\\]: \\[\\e[0m\\]',
              REPL_ID: replId,
              REPL_OWNER: username,
              REPL_OWNER_ID: userId,
              REPL_URL: replUrl
            }
          });
          channels[chanId].process.on('data', output => {
            ws.send(api.Command.encode(new api.Command({
              channel: chanId,
              output
            })).finish());
          });
          break;

        case 'ot':
          channels[chanId].otstatus = {
            content: '',
            version: 0,
            linkedFile: null,
            cursors: []
          };
          setTimeout(() => {
            ws.send(api.Command.encode(new api.Command({
              channel: chanId,
              ref: msg.ref,
              otstatus: channels[chanId].otstatus
            })).finish());
          }, 10);
          break;
      }

      ws.send(api.Command.encode(new api.OpenChannelRes({
        channel: 0,
        ref: msg.ref,
        openChanRes: {
          id: chanId
        },
        session: sessionId
      })).finish());
    } else if (msg.closeChan) {
      // TODO: use msg.closeChan.action (DISCONNECT|CLOSE|TRY_CLOSE)
      delete channels[msg.closeChan.id];

      console.log('Closing channel ID', msg.closeChan.id, `with service "${msg._service}":`, msg.closeChan.action);

      ws.send(api.Command.encode(new api.CloseChannelRes({
        channel: 0,
        ref: msg.ref,
        closeChanRes: {
          id: msg.closeChan.id,
          status: api.CloseChannelRes.Status.CLOSE
        }
      })).finish());
    } else if (msg.userEvent) {
      if (msg.userEvent.eventName == 'meta:ready' || msg.userEvent.eventName == 'meta:start') {
        replId = msg.userEvent.eventData.fields.replId.stringValue;
        replUrl = msg.userEvent.eventData.fields.url.stringValue;
        userId = msg.userEvent.eventData.fields.userId.numberValue;

        // Get username
        query('query user($id: Int!) { user(id: $id) { username } }', {
          id: userId
        }).then(res => {
          username = res.data.user.username;

          console.log('Client is', msg.userEvent.eventName == 'meta:ready'? 'ready' : 'starting', 'user ID', userId, `aka "@${username}", session ID`, sessionId);
        });
      } else if (msg.userEvent.eventName.startsWith('user:shell:')) {
        // ignore
      } else {
        console.log(`Received user event "${msg.userEvent.eventName}":`, msg.userEvent.eventData);
      }
    } else if (msg.exec) {
      if (msg.exec.args[0] == 'bash' && msg.exec.args[1] == '-c' && msg.exec.args[2] == 'date \'+%s%N\' && cat /sys/fs/cgroup/cpu/cpuacct.usage /sys/fs/cgroup/cpu/cpu.cfs_quota_us /sys/fs/cgroup/cpu/cpu.cfs_period_us /sys/fs/cgroup/memory/memory.usage_in_bytes /sys/fs/cgroup/memory/memory.soft_limit_in_bytes /sys/fs/cgroup/memory/memory.limit_in_bytes &&grep \'^\\(total_rss\\|total_cache\\) \' /sys/fs/cgroup/memory/memory.stat') {
        ws.send(api.Command.encode(new api.Command({
          channel: msg.channel,
          state: api.State.Running
        })).finish());

        setTimeout(() => {
          ws.send(api.Command.encode(new api.Command({
            channel: msg.channel,
            ref: msg.ref,
            output: `${Date.now() * 1000000}\n19746486204\n200000\n100000\n20770816\n2147483648\n3371548672\ntotal_cache 36864\ntotal_rss 17854464`
          })).finish());

          setTimeout(() => {
            ws.send(api.Command.encode(new api.Command({
              channel: msg.channel,
              state: api.State.Stopped
            })).finish());
          }, 10);
        }, 10);
      } else if (msg.exec.args[0] == 'bash' && msg.exec.args[1] == '-c' && msg.exec.args[2] == 'cat /repl/stats/subvolume_usage_bytes /repl/stats/subvolume_total_bytes') {
        ws.send(api.Command.encode(new api.Command({
          channel: msg.channel,
          state: api.State.Running
        })).finish());

        disk.check('.', (err, diskUsage) => {
          // TODO: handle errors

          ws.send(api.Command.encode(new api.Command({
            channel: msg.channel,
            output: `${diskUsage.total - diskUsage.free}\n${diskUsage.total}\n`
          })).finish());

          setTimeout(() => {
            ws.send(api.Command.encode(new api.Command({
              channel: msg.channel,
              ref: msg.ref,
              ok: {}
            })).finish());

            setTimeout(() => {
              ws.send(api.Command.encode(new api.Command({
                channel: msg.channel,
                state: api.State.Stopped
              })).finish());
            }, 10);
          }, 10);
        });
      } else {
        const cmd = msg.exec.args.map(s => {
          // Escape quotes and escapes
          s = s.replace(/("|\\)/g, '\\$1');

          // Wrap in quotes
          s = `"${s}"`;

          return s;
        }).join(' ');

        ws.send(api.Command.encode(new api.Command({
          channel: msg.channel,
          state: api.State.Running
        })).finish());

        // Run the command
        exec(cmd, {
          env: msg.exec.env || process.env
        }, (error, stdout, stderr) => {
          ws.send(api.Command.encode(new api.Command({
            channel: msg.channel,
            ref: msg.ref,
            output: stdout
          })).finish());

          const res = stderr.trim()? {
            error: stderr
          } : {
            ok: {}
          };
          ws.send(api.Command.encode(new api.Command({
            channel: msg.channel,
            ref: msg.ref,
            ...res
          })).finish());

          setTimeout(() => {
            ws.send(api.Command.encode(new api.Command({
              channel: msg.channel,
              state: api.State.Stopped
            })).finish());
          }, 10);
        });
      }
    } else if (msg.readdir) {
      fs.readdir(msg.readdir.path, {
        withFileTypes: true
      }, (err, files) => {
        ws.send(api.Command.encode(new api.Command({
          channel: msg.channel,
          ref: msg.ref,
          files: {
            files: files?.map(file => ({
              path: file.name,
              type: file.isDirectory()?
                api.File.Type.DIRECTORY :
                api.File.Type.REGULAR
            })) || []
          }
        })).finish());
      });
    } else if (msg.subscribeFile) {
      for (let file of msg.subscribeFile.files) {
        file = file.path;

        if (file in channels[msg.channel].subscriptions) {
          ws.send(api.Command.encode(new api.Command({
            channel: msg.channel,
            ref: msg.ref,
            ok: {}
          })).finish());
        } else {
          try {
            channels[msg.channel].subscriptions[file] = fs.watch(file, (e, filename) => {
              ws.send(api.Command.encode(new api.Command({
                channel: msg.channel,
                ref: msg.ref,
                ok: {}
              })).finish());
            });
          } catch (err) {
            ws.send(api.Command.encode(new api.Command({
              channel: msg.channel,
              ref: msg.ref,
              error: `unable to subscribe file from fsevents: ${err.message}`
            })).finish());
          }
        }
      }

      ws.send(api.Command.encode(new api.Command({
        channel: msg.channel,
        ref: msg.ref,
        ok: {}
      })).finish());
    } else if (msg.openFile) {
      console.debug('User', username, 'opened file:', msg.openFile.file, '(presence)');
    } else if (/*msg.otLinkFile?.file.path || */msg.read) {
      const file = msg.otLinkFile?.file.path || msg.read.path;

      fs.readFile(file, (err, data) => {
        if (err) {
          if (err.code == 'ENOENT') {
            ws.send(api.Command.encode(new api.Command({
              channel: msg.channel,
              ref: msg.ref,
              session: sessionId,
              error: `unable to read file content from gcsfiles: open ${file}: no such file or directory`
            })).finish());
          } else {
            ws.send(api.Command.encode(new api.Command({
              channel: msg.channel,
              ref: msg.ref,
              session: sessionId,
              error: `unable to read file content from gcsfiles: ${err.message}`
            })).finish());
          }
        } else {
          const bdata = data.toString('base64');

          const res = msg.otLinkFile?
            {
              otLinkFileResponse: {
                version: 1,
                linkedFile: {
                  path: file,
                  content: bdata
                }
              }
            } :
            {
              file: {
                path: file,
                content: bdata
              }
            };

          const constr = msg.otLinkFile? api.OTLinkFileResponse : api.Command;

          ws.send(api.Command.encode(new constr({
            channel: msg.channel,
            ref: msg.ref,
            session: sessionId,
            ...res
          })).finish());
        }
      });
    } else if (msg.write) {
      fs.writeFile(msg.write.path, msg.write.content, err => {
        if (err) {
          ws.send(api.Command.encode(new api.Command({
            channel: msg.channel,
            ref: msg.ref,
            error: `unable to write file content from gcsfiles: ${err.message}`
          })).finish());
        } else {
          ws.send(api.Command.encode(new api.Command({
            channel: msg.channel,
            ref: msg.ref,
            ok: {}
          })).finish());
        }
      });
    } else if (msg.otLinkFile) {
      if (channels[msg.channel].otstatus) {
        fs.readFile(msg.otLinkFile.file.path, (err, data) => {
          // TODO: handle errors

          channels[msg.channel].otstatus.linkedFile = msg.otLinkFile.file.path;
          ws.send(api.Command.encode(new api.Command({
            channel: msg.channel,
            ref: msg.ref,
            session: sessionId,
            otLinkFileResponse: {
              version: 1,
              linkedFile: {
                path: msg.otLinkFile.file.path,
                content: data.toString('base64')
              }
            }
          })).finish());
        });
      }
    } else if (msg.resizeTerm) {
      if (channels[msg.channel].process) {
        channels[msg.channel].process.resize(msg.resizeTerm.cols, msg.resizeTerm.rows);
      }
    } else if (msg.input) {
      const proc = channels[msg.channel].process;

      if (proc) {
        proc.write(msg.input);
      }
    } else {
      console.log(msg);
    }
  });

  const container = new api.Command();
  container.containerState = new api.ContainerState();
  container.containerState.state = api.ContainerState.State.READY;

  ws.send(api.Command.encode(container).finish());

  ws.send(api.Command.encode(new api.Command({
    channel: 0,
    toast: { text: 'Connecting to Nodeval... By @LuisAFK' }
  })).finish());
});

const checkDisconnectedClientsInterval = setInterval(() => {
  wss.clients.forEach(ws => {
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