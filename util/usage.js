function showUsage() {
  console.log(
    `
    Usage: node . [options]
  `
      .trim()
      .replace(/^ {4}/gm, '')
  );
}

module.exports = {
  showUsage,
};
