/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {BaseQuery} from '../../../shared/base-query.js';
import {InvalidParameterError} from '../../../../shared/errors/invalid-parameter.error.js';

/**
 * Parses a string as a decimal or hexadecimal integer.
 * File-private helper — not exported.
 * Throws `InvalidParameterError` if the value is not a valid integer.
 */
function parseId(value: string, paramName: string): number {
  const trimmed = value.trim();
  const num =
    trimmed.startsWith('0x') || trimmed.startsWith('0X')
      ? Number.parseInt(trimmed, 16)
      : Number.parseInt(trimmed, 10);
  if (Number.isNaN(num)) {
    throw new InvalidParameterError(paramName, value);
  }
  return num;
}

/**
 * Query to retrieve calibration data for a specific CKV (Calibration Key-Value)
 * belonging to an SPF module.
 *
 * All ID parameters are accepted as raw strings (as received from the HTTP layer)
 * and parsed to integers in the constructor. Decimal and hexadecimal (0x prefix)
 * notation are both supported. Throws `InvalidParameterError` (ERR_1004) if any
 * value cannot be parsed — controllers should catch this and map it to HTTP 400.
 *
 * Dispatched by the controller and handled by `GetCkvCalibrationDataHandler`.
 */
export class GetCkvCalibrationDataQuery extends BaseQuery {
  /** Project that owns the SPF module. */
  public readonly projectId: number;
  /** System ID of the SPF module instance. */
  public readonly spfModuleSystemId: number;
  /** System ID of the CKV to retrieve calibration data for. */
  public readonly ckvSystemId: number;
  /** Optional filter: only return data for these parameter system IDs. */
  public readonly paramSystemIds?: number[];

  constructor(
    projectIdStr: string,
    spfModuleSystemIdStr: string,
    ckvSystemIdStr: string,
    clientId: string,
    /** Optional comma-separated list of parameter system IDs (decimal or hex). */
    paramSystemIdsStr?: string,
  ) {
    super(clientId);
    this.projectId = parseId(projectIdStr, 'projectId');
    this.spfModuleSystemId = parseId(spfModuleSystemIdStr, 'spfModuleSystemId');
    this.ckvSystemId = parseId(ckvSystemIdStr, 'ckvSystemId');
    this.paramSystemIds = paramSystemIdsStr
      ? paramSystemIdsStr
          .split(',')
          .map(id => parseId(id.trim(), 'param-system-ids'))
      : undefined;
  }
}