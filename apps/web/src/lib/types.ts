export interface Phase1RowInput {
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

/** IndexedDB staging row — extends Phase1RowInput with upload status */
export interface StagedRow extends Phase1RowInput {
  id?: number; // IndexedDB auto-generated primary key
  status: 'pending' | 'uploaded' | 'error';
  errorReason?: string;
  coordinateWarning?: string;
}
