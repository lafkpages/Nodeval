const { exec } = require('child_process');

function checkCommand(cmd) {
  const r = {
    installed: false,
    path: null,
    error: null,
  };

  return new Promise((resolve, reject) => {
    exec(`command -v "${cmd}"`, (err, path, stderr) => {
      if (err) {
        r.error = err;
        resolve(r);
      } else {
        stderr = stderr.trim();

        if (stderr) {
          r.error = stderr;
          resolve(r);
        } else {
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

async function checkCommandInteractive(cmd, opts = {}) {
  opts = {
    name: null,
    required: false,
    newLine: true,
    exitCode: 63,
    logFunc: null,
    ...opts,
  };

  if (!opts.logFunc) {
    opts.logFunc = opts.required ? console.error : console.warn;
  }

  const r = await checkCommand(cmd);

  if (r.installed) {
    return true;
  }

  opts.logFunc(
    `${opts.required ? 'Warning' : 'Error'}:${opts.name ? '' : ' command'} "${
      opts.name || cmd
    }" not found, but is ${
      opts.required ? 'required' : 'recommended'
    } by this program.${opts.newLine ? '\n' : ''}`
  );

  if (opts.required) {
    process.exit(opts.exitCode);
  }

  return false;
}

async function checkCommandsInteractive(cmds, defaultOpts = {}) {
  const r = [];

  defaultOpts = {
    newLine: false,
    ...defaultOpts,
  };

  for (let [cmd, opts] of Object.entries(cmds)) {
    if (typeof opts == 'boolean') {
      opts = { required: opts };
    }

    opts = {
      ...defaultOpts,
      ...opts,
    };

    r.push(await checkCommandInteractive(cmd, opts));
  }

  return r;
}

module.exports = {
  checkCommand,
  checkCommandInteractive,
  checkCommandsInteractive,
};
