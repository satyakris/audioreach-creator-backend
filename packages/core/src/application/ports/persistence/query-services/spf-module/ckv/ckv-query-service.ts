/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {
  CkvReadModel,
  ParameterPayloadReadModel,
} from './ckv-read-model.js';

export interface CkvQueryService {
  getCkv(
    fileSystemId: number,
    ckvSystemId: number,
  ): Promise<CkvReadModel | null>;
  getCkvPayloads(
    fileSystemId: number,
    ckvSystemId: number,
    paramSystemIds?: number[],
  ): Promise<ParameterPayloadReadModel[]>;
}
