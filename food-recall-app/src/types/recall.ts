export type RecallClassification = "Class I" | "Class II" | "Class III" | "Not Yet Classified" | "Unknown";
export type RecallSource = "FDA" | "USDA-FSIS";

/** Records are an openFDA snapshot, not a live FDA recall-lifecycle feed. */
export const OPENFDA_AS_PUBLISHED = "As published by openFDA — not a live FDA recall lifecycle.";
/** FSIS rows are a snapshot of the official Recall API, not a live USDA lifecycle. */
export const FSIS_AS_PUBLISHED = "As published by USDA FSIS — not a live recall lifecycle.";
export interface Recall {
  id: string;
  recallNumber: string;
  eventId: string;
  productDescription: string;
  reasonForRecall: string;
  classification: RecallClassification;
  status: string;
  distributionPattern: string;
  recallingFirm: string;
  city: string;
  state: string;
  country: string;
  recallInitiationDate: string;
  productType: string;
  codeInfo: string;
  moreCodeInfo: string;
  voluntaryMandated: string;
  rawClassification?: string;
  rawStatus?: string;
  address1: string;
  address2: string;
  postalCode: string;
  centerClassificationDate: string;
  initialFirmNotification: string;
  productQuantity: string;
  terminationDate: string;
  source: RecallSource;
  // FSIS-specific fields (empty for FDA recalls)
  establishmentNumber?: string;
  hazard?: string;
  link?: string;
}
export interface OpenFDAResponse {
  meta: { results: { total: number; skip: number; limit: number } };
  results: any[];
}
