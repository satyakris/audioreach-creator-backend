/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {z} from 'zod';
import type {DataType} from '../../../../file-operations/shared/awsp-serializers/v1/definitions/common/type/data-type.js';

// ── TypeScript interfaces defined first so Zod schemas can reference them ────
// (required for recursive z.lazy() types to produce a proper union, not `any`)

export interface ConfigElement {
  elementType: 'ConfigElement';
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
}

export interface StructElement {
  elementType: 'Struct';
  name: string;
  description?: string;
  structureType: string;
  elements: DefinitionElement[];
}

export interface ElementArray {
  elementType: 'ElementArray';
  name: string;
  description?: string;
  template: {elements: DefinitionElement[]};
  arrayLenFormulaStr?: string;
  arrayLength?: number;
  groupSet?: number;
}

export type DefinitionElement = ConfigElement | StructElement | ElementArray;

// ── Zod schemas ───────────────────────────────────────────────────────────────

const ConfigElementZodSchema = z.object({
  elementType: z.literal('ConfigElement'),
  name: z.string().optional(),
  description: z.string().optional(),
  dataType: z.enum([
    'UInt8',
    'UInt16',
    'UInt32',
    'UInt64',
    'Int8',
    'Int16',
    'Int32',
    'Int64',
    'Float',
    'Double',
    'RawData',
  ]),
  displayType: z.string().optional(),
  policy: z.string().optional(),
  qFormat: z.string().optional(),
  unitStr: z.string().optional(),
  precision: z.number().optional(),
  isReadOnly: z.boolean().optional(),
  min: z.string().optional(),
  max: z.string().optional(),
  defaultValue: z.string().optional(),
  rangeList: z
    .array(z.object({name: z.string(), value: z.string()}))
    .optional(),
  dependentOnElements: z.array(z.object({name: z.string()})).optional(),
  group: z.string().optional(),
  subgroup: z.string().optional(),
});

// z.lazy() required for recursive types — use z.union (not z.discriminatedUnion)
// because z.discriminatedUnion in Zod v4 does not accept lazy members.
// Explicit type parameters ensure DefinitionElement resolves to a proper union, not `any`.
const ElementArrayZodSchema: z.ZodType<ElementArray> = z.lazy(() =>
  z.object({
    elementType: z.literal('ElementArray'),
    name: z.string(),
    description: z.string().optional(),
    template: z.object({
      elements: z.array(DefinitionElementZodSchema),
    }),
    arrayLenFormulaStr: z.string().optional(),
    arrayLength: z.number().optional(),
    groupSet: z.number().optional(),
  }),
);

const StructZodSchema: z.ZodType<StructElement> = z.lazy(() =>
  z.object({
    elementType: z.literal('Struct'),
    name: z.string(),
    description: z.string().optional(),
    structureType: z.string(),
    elements: z.array(DefinitionElementZodSchema),
  }),
);

export const DefinitionElementZodSchema: z.ZodType<DefinitionElement> = z.union(
  [ConfigElementZodSchema, StructZodSchema, ElementArrayZodSchema],
);

export const ParamStructureZodSchema: z.ZodType<DefinitionElement[]> = z.array(
  DefinitionElementZodSchema,
);

export {type DataType} from '../../../../file-operations/shared/awsp-serializers/v1/definitions/common/type/data-type.js';
