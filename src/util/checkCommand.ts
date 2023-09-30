import { exec } from 'child_process';
import type { ExecException } from 'child_process';
import type { AsyncReturnType } from '../types';

export interface CheckCommandResult {
  installed: boolean;
  path: string | null;
  error: ExecException | string | null;
}

export interface CheckCommandOptions {
  name?: string | null;
  required?: boolean;
  newLine?: boolean;
  exitCode?: number;
  logFunc?: Function | null;
  url?: string | null;
}

export function checkCommand(cmd: string): Promise<CheckCommandResult> {
  const r: CheckCommandResult = {
    installed: false,
    path: null,
    error: null,
  };

  return new Promise((resolve) => {
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

export async function checkCommandInteractive(
  cmd: string,
  opts: CheckCommandOptions = {}
) {
  opts = {
    name: null,
    required: false,
    newLine: true,
    exitCode: 63,
    logFunc: null,
    url: null,
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
    } by this program.${
      opts.url ? ` It can be downloaded at ${opts.url}` : ''
    }${opts.newLine ? '\n' : ''}`
  );

  if (opts.required) {
    process.exit(opts.exitCode);
  }

  return false;
}

export async function checkCommandsInteractive(
  cmds: {
    [cmd: string]: boolean | CheckCommandOptions;
  },
  defaultOpts: CheckCommandOptions = {}
) {
  const r: AsyncReturnType<typeof checkCommandInteractive>[] = [];

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
