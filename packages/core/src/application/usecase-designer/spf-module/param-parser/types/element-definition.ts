/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {DataType} from '../../../../file-operations/shared/awsp-serializers/v1/definitions/common/type/data-type.js';

/** Discriminator values for the `elementType` field in the parameter structure JSON schema (DB layer). */
export const PARAMETER_ELEMENT_TYPE = {
  ConfigElement: 'ConfigElement',
  Struct: 'Struct',
  ElementArray: 'ElementArray',
} as const;

export type ParameterElementType =
  (typeof PARAMETER_ELEMENT_TYPE)[keyof typeof PARAMETER_ELEMENT_TYPE];

// ── DB-layer element type interfaces (used by the parameter-data parser) ──────

export interface ConfigElement {
  elementType: typeof PARAMETER_ELEMENT_TYPE.ConfigElement;
  name?: string;
  description?: string;
  dataType: DataType;
  displayType?: string;
  policy?: string;
  qFormat?: string;
  unitStr?: string;
  precision?: number;
  isReadOnly?: boolean;
  min?: string;
  max?: string;
  defaultValue?: string;
  rangeList?: Array<{name: string; value: string}>;
  dependentOnElements?: Array<{name: string}>;
  group?: string;
  subgroup?: string;
  alignment?: number;
  channel?: number;
  groupSet?: number;
  rtmPlotType?: string;
  copySrc?: string;
  displayName?: string;
  linkedByForFormula?: string[];
  defaultDataDepends?: string[];
}

export interface StructElement {
  elementType: typeof PARAMETER_ELEMENT_TYPE.Struct;
  name: string;
  description?: string;
  structureType: string;
  elements: DefinitionElement[];
  alignment?: number;
  channel?: number;
  groupSet?: number;
  rtmPlotType?: string;
  group?: string;
  subgroup?: string;
  copySrc?: string;
}

export interface ElementArray {
  elementType: typeof PARAMETER_ELEMENT_TYPE.ElementArray;
  name: string;
  description?: string;
  template: {elements: DefinitionElement[]};
  arrayLenFormulaStr?: string;
  arrayLength?: number;
  groupSet?: number;
  alignment?: number;
  channel?: number;
  rtmPlotType?: string;
  group?: string;
  subgroup?: string;
  copySrc?: string;
  copySrcInfoList?: string[];
  displayType?: string;
  policy?: string;
  isReadOnly?: boolean;
}

export type DefinitionElement = ConfigElement | StructElement | ElementArray;
