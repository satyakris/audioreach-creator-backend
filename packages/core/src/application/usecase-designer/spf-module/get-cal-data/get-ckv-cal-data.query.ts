/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {BaseQuery} from '../../../shared/base-query.js';

/**
 * Query to retrieve calibration data for a specific CKV (Calibration Key-Value)
 * belonging to an SPF module.
 *
 * Dispatched by the controller and handled by `GetCkvCalibrationDataHandler`.
 */
export class GetCkvCalibrationDataQuery extends BaseQuery {
  constructor(
    /** Project that owns the SPF module. */
    public readonly projectId: number,
    /** System ID of the SPF module instance. */
    public readonly spfModuleSystemId: number,
    /** System ID of the CKV to retrieve calibration data for. */
    public readonly ckvSystemId: number,
    clientId: string,
    /** Optional filter: only return data for these parameter system IDs. */
    public readonly paramSystemIds?: number[],
  ) {
    super(clientId);
  }
}
