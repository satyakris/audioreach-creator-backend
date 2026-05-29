/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {PARAMETER_ELEMENT_TYPE} from './element-definition.js';

// ── Shared base fields present on every element variant ───────────────────────

export interface ParsedElementBase {
  name: string;
  description?: string;
  group?: string;
  subgroup?: string;
  isReadOnly: boolean;
  alignment?: number;
  channel?: number;
  groupSet?: number;
  rtmPlotType?: string;
  copySrc?: string;
}

// ── Schema types (no value — used in ElementArrayData.template) ───────────────

export interface ConfigElementSchema extends ParsedElementBase {
  type: typeof PARAMETER_ELEMENT_TYPE.ConfigElement;
  dataType: string;
  unit?: string;
  displayType?: string;
  policy?: string;
  qFormat?: string;
  precision?: number;
  defaultValue?: string;
  min?: string;
  max?: string;
  rangeList?: Array<{name: string; value: string}>;
  dependentOnElements?: Array<{name: string}>;
  displayName?: string;
  linkedByForFormula?: string[];
  defaultDataDepends?: string[];
}

export interface StructSchema extends ParsedElementBase {
  type: typeof PARAMETER_ELEMENT_TYPE.Struct;
  structureType: string;
  children: ElementSchema[];
}

export interface ElementArraySchema extends ParsedElementBase {
  type: typeof PARAMETER_ELEMENT_TYPE.ElementArray;
  template: ElementSchema;
  length?: number;
  arrayLenFormulaStr?: string;
  copySrcInfoList?: string[];
  displayType?: string;
  policy?: string;
}

export type ElementSchema = ConfigElementSchema | StructSchema | ElementArraySchema;

// ── Data types (value required — output of parseParameterData) ────────────────

export interface ConfigElementData extends ConfigElementSchema {
  value: string;
}

export interface StructData extends ParsedElementBase {
  type: typeof PARAMETER_ELEMENT_TYPE.Struct;
  structureType: string;
  value: ParsedElementData[];
}

export interface ElementArrayData extends ParsedElementBase {
  type: typeof PARAMETER_ELEMENT_TYPE.ElementArray;
  template: ElementSchema;
  value: ParsedElementData[];
  length: number;
  arrayLenFormulaStr?: string;
  copySrcInfoList?: string[];
  displayType?: string;
  policy?: string;
}

export type ParsedElementData =
  | ConfigElementData
  | StructData
  | ElementArrayData;
