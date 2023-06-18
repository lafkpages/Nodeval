// This isn't working...?

declare module ".file-history.json" {
  type Version = import('./types').Version;

  const value: {
    [file: string]: {
      versions: Version[];
    };
  };

  export default value;
}
