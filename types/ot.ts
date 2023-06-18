export interface OTv1 {
  insert?: string;
  delete?: number;
  skip?: number;
}

export interface OTv2 {
  op: 'insert' | 'delete' | 'skip';
  value?: string;
  count?: number;
}

export type OT = OTv1 | OTv2;

export interface Diff {
  added?: boolean;
  value?: string;
  removed?: boolean;
  count?: number;
}

export interface Version {
  spookyVersion: number;
  op: OTv1[];
  crc32: number;
  comitted: {
    seconds: number;
    nanos: number;
  };
  version: number;
  userId: number;
}
