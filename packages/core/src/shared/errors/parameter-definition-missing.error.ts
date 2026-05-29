/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {ERROR_CODES} from './error-codes.js';

/**
 * Thrown by `GetCkvCalibrationDataHandler` when a `CkvParameterPayload` row has a
 * non-null payload but no matching `SpfModuleParameterDefinition` row exists for its
 * `parameterSystemId`.
 *
 * `CkvParameterPayload.parameterSystemId` is a foreign key to
 * `SpfModuleParameterDefinition`. A payload without a definition indicates a database
 * integrity violation — distinct from a legitimately absent payload (`payload IS NULL`).
 *
 * Controllers should catch this by type and map it to HTTP 500 (internal data integrity
 * failure) or surface it as a warning in `ApiResult.warnings`, depending on policy.
 */
export class ParameterDefinitionMissingError extends Error {
  readonly code = ERROR_CODES.PARAMETER_DEF_MISSING;

  constructor(public readonly parameterSystemId: number) {
    super(
      `No parameter definition found for parameterSystemId=${parameterSystemId} but a payload exists`,
    );
    this.name = 'ParameterDefinitionMissingError';
  }
}
