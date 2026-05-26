/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

interface ParsedElementBase {
  name: string;
  description?: string;
  group?: string;
  subgroup?: string;
  isReadOnly: boolean;
}

// ── Schema types (no value — used in ElementArrayData.template) ──────────────

export interface ConfigElementSchema extends ParsedElementBase {
  type: 'CONFIG_ELEMENT';
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
}

export interface StructSchema extends ParsedElementBase {
  type: 'STRUCT';
  structureType: string; // C type struct name (e.g. 'limiter_config_param_t') — may differ from element name (e.g. 'limiter')
  children: ParsedElementSchema[];
}

export interface ElementArraySchema extends ParsedElementBase {
  type: 'ELEMENT_ARRAY';
  template: ParsedElementSchema;
  length?: number;
  arrayLenFormulaStr?: string;
}

export type ParsedElementSchema =
  | ConfigElementSchema
  | StructSchema
  | ElementArraySchema;

// ── Data types (value required — output of parseParameterData) ────────────────

export interface ConfigElementData extends ConfigElementSchema {
  value: string;
}

export interface StructData extends ParsedElementBase {
  type: 'STRUCT';
  structureType: string; // C type struct name (e.g. 'limiter_config_param_t') — may differ from element name (e.g. 'limiter')
  value: ParsedElementData[];
}

export interface ElementArrayData extends ParsedElementBase {
  type: 'ELEMENT_ARRAY';
  template: ParsedElementSchema;
  value: ParsedElementData[];
  length: number;
  arrayLenFormulaStr?: string;
}

export type ParsedElementData =
  | ConfigElementData
  | StructData
  | ElementArrayData;
