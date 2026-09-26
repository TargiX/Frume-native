// Current catalog selection. Historical catalogs remain immutable.
import { BAKED_CUT_LIBRARY_V1 } from './bakedLibrary.v1';
import { BAKED_CUT_LIBRARY_V2 } from './bakedLibrary.v2';

export const BAKED_CUT_LIBRARY_VERSION = 2;
export const BAKED_CUT_LIBRARY = BAKED_CUT_LIBRARY_V2;
export const BAKED_CUT_LIBRARIES = { 1: BAKED_CUT_LIBRARY_V1, 2: BAKED_CUT_LIBRARY_V2 } as const;
