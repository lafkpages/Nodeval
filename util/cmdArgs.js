function escapeQuotes(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function cmdArgsToString(args) {
  return args
    .map((s) => {
      // Escape quotes and escapes
      s = s.replace(/("|\\)/g, '\\$1');

      // Wrap in quotes
      s = `"${s}"`;

      return s;
    })
    .join(' ');
}

function cmdStringToArgs(cmd, includeShC = true) {
  return [...(includeShC ? ['sh', '-c'] : []), `'${escapeQuotes(cmd)}'`];
}

module.exports = {
  escapeQuotes,
  cmdArgsToString,
  cmdStringToArgs,
};
