/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {ChangeInfo} from '../../../shared/change-vocabulary.js';
import type {CkvReadModel} from '../../../ports/persistence/query-services/spf-module/ckv/ckv-read-model.js';
import type {ParsedElementData} from '../param-parser/types/parsed-element-data.js';

export interface ParameterCalibrationReadModel {
  parameterSystemId: number;
  changeInfo: ChangeInfo;
  parameterId: number;
  name: string;
  description?: string;
  isReadOnly: boolean;
  isHidden?: boolean;
  pidType: string;
  parsedData: ParsedElementData[] | null; // null when payload is null
}

export interface CkvCalibrationReadModel {
  ckv: CkvReadModel;
  parameters: ParameterCalibrationReadModel[];
}
