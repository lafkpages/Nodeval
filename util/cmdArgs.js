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
  return includeShC
    ? ['sh', '-c', `'${escapeQuotes(cmd)}'`]
    : _cmdStringToArgs(cmd).map((chunk) =>
        /\s/.test(chunk) ? `'${escapeQuotes(chunk)}'` : chunk
      );
}

function _cmdStringToArgs(cmd) {
  const result = [];
  const log_matches = false;

  const regex = /(([\w-/_~\.]+)|("(.*?)")|('(.*?)'))/g;
  const groups = [2, 4, 6];
  let match;

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
          console.log(`Match '${m}' found in group: ${group}`);
        }
      });
  }

  return result;
}

module.exports = {
  escapeQuotes,
  cmdArgsToString,
  cmdStringToArgs,
};
