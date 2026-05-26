/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {CkvQueryService} from './ckv/ckv-query-service.js';

export interface SpfModuleQueryService {
  getModuleDefinitionSystemId(spfModuleSystemId: number): Promise<number>;
  readonly ckvQueryService: CkvQueryService;
}
