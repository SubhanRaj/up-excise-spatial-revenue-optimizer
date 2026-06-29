import type { D1Database } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  CLERK_SECRET_KEY: string;
  CLERK_WEBHOOK_SIGNING_SECRET: string;
  ENVIRONMENT?: string;
}

export interface Variables {
  deoId: string;
  districtName: string | null;
  role: 'deo' | 'admin';
}

export interface Phase1Row {
  districtName: string;
  circleSectorName: string;
  thanaName: string;
  adjacentThanasRaw: string | null;
  shopId: string;
  shopName: string;
  shopType: string;
  hasCl5cc: boolean;
  latitudeDms: string | null;
  longitudeDms: string | null;
  latitudeDecimal: number | null;
  longitudeDecimal: number | null;
  licenseFeeLf: number;
  basicLicenseFeeBlf: number;
  mgrAmount: number;
  compositeLfFl: number;
  compositeLfBeer: number;
  compositeMgrFl: number;
  compositeMgrBeer: number;
  mgqQuantity: number;
  considerationFee: number;
  specialBeerLf: number;
  specialBeerMgr: number;
  totalRevenue: number;
  uploadedByDeo: string;
}

export interface ChunkBody {
  rows: Phase1Row[];
  deoId: string;
  districtName: string;
  circleSectorName: string;
  chunkIndex: number;
}

export interface RejectedRow {
  rowIndex: number;
  reason: string;
}

export type HonoEnv = { Bindings: Env; Variables: Variables };
