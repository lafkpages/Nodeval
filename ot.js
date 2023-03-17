function applyOTs(file, ots, start=0, err=true) {
  let cursor = start;

  for (let ot of ots) {
    // According to Turbio's crosis docs, the following is a valid OT:
    // { insert: 'hi' }

    if (ot.insert) {
      ot = {
        op: 'insert',
        chars: ot.insert
      };
    } else if (ot.delete) {
      ot = {
        op: 'delete',
        count: ot.delete
      };
    } else if (ot.skip) {
      ot = {
        op: 'skip',
        count: ot.skip
      };
    }

    switch (ot.ot || ot.op) {
      case 'insert':
        file = file.substr(0, cursor) + ot.chars + file.substr(cursor);
        cursor += ot.chars.length;
        break;

      case 'delete':
        if (cursor + ot.count > file.length && err) {
          throw new Error('Can\'t delete past the end of a string');
        }
        file = file.substr(0, cursor) + file.substr(cursor + ot.count);
        break;

      case 'skip':
        cursor += ot.count;
        if (cursor > file.length && err) {
          throw new Error('Can\'t skip past the end of a string');
        }
    }
  }

  return {
    file,
    cursor
  };
}

function verifyOTs(stale, latest, ots, err=true) {
  try {
    return applyOTs(stale, ots, 0, err).file == latest;
  } catch (_) {
    return false;
  }
}

module.exports = {
  applyOTs,
  verifyOTs
};