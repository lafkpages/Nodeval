import type { OTv1, OTv2, OT, Diff, Version } from './ot';

export { OTv1, OTv2, OT, Diff, Version };

export interface DotReplit {
  run?: string/* | string[]*/;
  fullRunCommandArgs?: string[];
  languages?: {
    [key: string]: LanguageServerConfig;
  } | null;
  [key: string]: any;
}

export interface LanguageServerConfig {
  pattern?: string;
  languageServer?: {
    start?: string;
  } | null;
}

export interface Cursor {
  position: number;
  selectionStart: number;
  selectionEnd: number;
  user: {
    id?: number;
    name: string;
  };
  id: string;
}

export type AsyncReturnType<T extends (...args: any) => Promise<any>> =
  T extends (...args: any) => Promise<infer R> ? R : any;
