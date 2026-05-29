/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {ERROR_CODES} from './error-codes.js';

/**
 * Thrown when a query parameter cannot be parsed into the expected type.
 *
 * For example, thrown by `GetCkvCalibrationDataQuery` when `projectId`,
 * `spfModuleSystemId`, `ckvSystemId`, or an entry in `param-system-ids`
 * is not a valid decimal or hexadecimal integer.
 *
 * Controllers should catch this by type and map it to HTTP 400 (Bad Request).
 */
export class InvalidParameterError extends Error {
  readonly code = ERROR_CODES.INVALID_PARAMETER;

  constructor(
    public readonly paramName: string,
    public readonly value: string,
  ) {
    super(
      `Invalid ${paramName}: "${value}" is not a valid integer or hex value`,
    );
    this.name = 'InvalidParameterError';
  }
}
