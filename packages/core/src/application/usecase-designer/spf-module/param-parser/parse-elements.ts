/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {PARAMETER_ELEMENT_TYPE} from './types/element-definition.js';
import type {
  ConfigElement,
  StructElement,
  ElementArray,
  DefinitionElement,
} from './types/element-definition.js';
import type {
  ParsedElementData,
  ElementSchema,
  ConfigElementData,
  StructData,
  ElementArrayData,
} from './types/parsed-element-data.js';
import {BinaryDataReader} from './utils/binary-data-reader.js';
import {evaluateFormula} from './utils/formular-evaluator.js';

/**
 * Converts a `Uint8Array` to a lowercase hex string (e.g. `[0x0a, 0xff]` → `"0aff"`).
 * Used to produce the `_raw` fallback value when parsing fails.
 */
function toHex(payload: Uint8Array): string {
  return [...payload].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Produces a single `_raw` `ConfigElementData` entry containing the full payload
 * as a hex string. Returned whenever parsing fails for any reason (malformed JSON,
 * buffer overflow, or any other runtime error).
 */
function rawFallback(payload: Uint8Array): ConfigElementData {
  return {
    type: PARAMETER_ELEMENT_TYPE.ConfigElement,
    name: '_raw',
    isReadOnly: true,
    dataType: 'RawData',
    value: toHex(payload),
  };
}

/**
 * Parses binary parameter payloads into structured `ParsedElementData` trees.
 *
 * Reads `payload` bytes sequentially according to the `paramStructure` JSON schema
 * stored in `SpfModuleParameterDefinitionRow.paramStructure`. `paramStructure` is
 * validated in the DB layer before storage, so no re-validation is performed here.
 *
 * Supported element types:
 * - `ConfigElement` — scalar value (UInt8/16/32/64, Int8/16/32/64, Float, Double, RawData)
 * - `Struct` — named group of child elements parsed in order
 * - `ElementArray` — fixed-length or formula-driven array of a template element
 *
 * On any error (malformed JSON, buffer overflow, or other runtime error),
 * returns a single `_raw` `ConfigElementData` containing the full payload as a
 * hex string rather than throwing.
 *
 * @param payload - Raw binary data from `CkvParameterPayloadRow.payload`
 * @param paramStructure - JSON string from `SpfModuleParameterDefinitionRow.paramStructure`
 * @returns Array of parsed elements, or a single `_raw` fallback on any error
 */
export function parseParameterData(
  payload: Uint8Array,
  paramStructure: string,
): ParsedElementData[] {
  try {
    // paramStructure is validated in the DB layer before being stored;
    // cast directly to DefinitionElement[] without re-validating.
    const definitions = JSON.parse(paramStructure) as DefinitionElement[];
    const reader = new BinaryDataReader(payload);
    const parsed: ParsedElementData[] = [];
    for (const element of definitions) {
      parsed.push(parseElement(element, reader, parsed));
    }
    return parsed;
  } catch {
    return [rawFallback(payload)];
  }
}

/**
 * Dispatches parsing to the appropriate handler based on `elementType`.
 * `parsedSoFar` is passed through so formula-driven array lengths can
 * reference previously parsed scalar values by name.
 */
function parseElement(
  element: DefinitionElement,
  reader: BinaryDataReader,
  parsedSoFar: ParsedElementData[],
): ParsedElementData {
  if (element.alignment) {
    reader.align(element.alignment);
  }
  switch (element.elementType) {
    case 'ConfigElement':
      return parseConfigElement(element, reader);
    case 'Struct':
      return parseStruct(element, reader, parsedSoFar);
    case 'ElementArray':
      return parseElementArray(element, reader, parsedSoFar);
  }
}

/**
 * Reads a single scalar value from the binary stream and wraps it in a
 * `ConfigElementData`. The value is stored as a string to match the DTO contract.
 * For `RawData`, all remaining bytes are consumed and stored as a comma-separated
 * decimal string.
 */
function parseConfigElement(
  element: ConfigElement,
  reader: BinaryDataReader,
): ConfigElementData {
  const raw = readScalar(element.dataType, reader);
  const value =
    raw instanceof Uint8Array ? [...raw].toString() : raw.toString();
  return {
    type: PARAMETER_ELEMENT_TYPE.ConfigElement,
    name: element.name ?? '',
    description: element.description,
    group: element.group,
    subgroup: element.subgroup,
    isReadOnly: element.isReadOnly ?? false,
    dataType: element.dataType,
    unit: element.unitStr,
    displayType: element.displayType,
    policy: element.policy,
    qFormat: element.qFormat,
    precision: element.precision,
    defaultValue: element.defaultValue,
    min: element.min,
    max: element.max,
    rangeList: element.rangeList,
    dependentOnElements: element.dependentOnElements,
    alignment: element.alignment,
    channel: element.channel,
    groupSet: element.groupSet,
    rtmPlotType: element.rtmPlotType,
    copySrc: element.copySrc,
    displayName: element.displayName,
    linkedByForFormula: element.linkedByForFormula,
    defaultDataDepends: element.defaultDataDepends,
    value,
  };
}

/** Reads the next scalar value of the given `dataType` from the binary stream. */
// eslint-disable-next-line sonarjs/function-return-type
function readScalar(
  dataType: string,
  reader: BinaryDataReader,
): number | bigint | Uint8Array {
  switch (dataType) {
    case 'UInt8':
      return reader.readUInt8();
    case 'UInt16':
      return reader.readUInt16();
    case 'UInt32':
      return reader.readUInt32();
    case 'UInt64':
      return reader.readUInt64();
    case 'Int8':
      return reader.readInt8();
    case 'Int16':
      return reader.readInt16();
    case 'Int32':
      return reader.readInt32();
    case 'Int64':
      return reader.readInt64();
    case 'Float':
      return reader.readFloat();
    case 'Double':
      return reader.readDouble();
    case 'RawData':
      return reader.readRawData(reader.getRemainingBytes());
    default:
      throw new Error(`Unknown dataType: ${dataType}`);
  }
}

/**
 * Parses a `Struct` element by recursively parsing each child element in order.
 * Children are accumulated and passed as `parsedSoFar` context to later siblings
 * so that formula references within the struct can resolve correctly.
 */
function parseStruct(
  element: StructElement,
  reader: BinaryDataReader,
  parsedSoFar: ParsedElementData[],
): StructData {
  const children: ParsedElementData[] = [];
  for (const child of element.elements) {
    children.push(
      parseElement(child, reader, [...parsedSoFar, ...children]),
    );
  }
  return {
    type: PARAMETER_ELEMENT_TYPE.Struct,
    name: element.name,
    description: element.description,
    group: element.group,
    subgroup: element.subgroup,
    isReadOnly: false,
    structureType: element.structureType,
    alignment: element.alignment,
    channel: element.channel,
    groupSet: element.groupSet,
    rtmPlotType: element.rtmPlotType,
    copySrc: element.copySrc,
    value: children,
  };
}

/**
 * Parses an `ElementArray` by determining its length (from `arrayLength` or by
 * evaluating `arrayLenFormulaStr` against previously parsed elements), then
 * parsing each item using the array's template element definition.
 *
 * Items are named `<arrayName>[i]` when the template element has no explicit name.
 */
function parseElementArray(
  element: ElementArray,
  reader: BinaryDataReader,
  parsedSoFar: ParsedElementData[],
): ElementArrayData {
  const length =
    element.arrayLength ??
    computeArrayLength(element.arrayLenFormulaStr ?? '', parsedSoFar);

  const templateElements = element.template.elements;
  const arrayName = element.name;

  const templateSchema = buildTemplateSchema(templateElements, arrayName);

  const items: ParsedElementData[] = [];
  for (let i = 0; i < length; i++) {
    items.push(
      parseTemplateItem(
        templateElements,
        reader,
        [...parsedSoFar, ...items],
        arrayName,
        i,
      ),
    );
  }

  return {
    type: PARAMETER_ELEMENT_TYPE.ElementArray,
    name: arrayName,
    description: element.description,
    group: element.group,
    subgroup: element.subgroup,
    isReadOnly: element.isReadOnly ?? false,
    alignment: element.alignment,
    channel: element.channel,
    groupSet: element.groupSet,
    rtmPlotType: element.rtmPlotType,
    copySrc: element.copySrc,
    copySrcInfoList: element.copySrcInfoList,
    displayType: element.displayType,
    policy: element.policy,
    template: templateSchema,
    value: items,
    length,
    arrayLenFormulaStr: element.arrayLenFormulaStr,
  };
}

/**
 * Builds a `ParsedElementSchema` descriptor from the template element definition.
 * For single-element templates the schema mirrors the element's type.
 * For multi-element templates a synthetic `STRUCT` schema is returned.
 */
function buildTemplateSchema(
  templateElements: DefinitionElement[],
  arrayName: string,
): ElementSchema {
  if (templateElements.length === 1) {
    return buildSingleElementSchema(templateElements[0], arrayName);
  }
  return {
    type: PARAMETER_ELEMENT_TYPE.Struct,
    name: arrayName,
    isReadOnly: false,
    structureType: '',
    children: [],
  };
}

function buildSingleElementSchema(
  el: DefinitionElement,
  arrayName: string,
): ElementSchema {
  const name = el.name ?? arrayName;
  switch (el.elementType) {
    case 'ConfigElement':
      return {
        type: PARAMETER_ELEMENT_TYPE.ConfigElement,
        name,
        isReadOnly: el.isReadOnly ?? false,
        dataType: el.dataType,
        unit: el.unitStr,
        displayType: el.displayType,
        policy: el.policy,
        qFormat: el.qFormat,
        precision: el.precision,
        defaultValue: el.defaultValue,
        min: el.min,
        max: el.max,
        rangeList: el.rangeList,
        dependentOnElements: el.dependentOnElements,
        description: el.description,
        alignment: el.alignment,
        channel: el.channel,
        groupSet: el.groupSet,
        rtmPlotType: el.rtmPlotType,
        copySrc: el.copySrc,
        displayName: el.displayName,
        linkedByForFormula: el.linkedByForFormula,
        defaultDataDepends: el.defaultDataDepends,
      };
    case 'Struct':
      return {
        type: PARAMETER_ELEMENT_TYPE.Struct,
        name,
        isReadOnly: false,
        description: el.description,
        group: el.group,
        subgroup: el.subgroup,
        structureType: el.structureType,
        alignment: el.alignment,
        channel: el.channel,
        groupSet: el.groupSet,
        rtmPlotType: el.rtmPlotType,
        copySrc: el.copySrc,
        children: [],
      };
    default:
      return {
        type: PARAMETER_ELEMENT_TYPE.ElementArray,
        name,
        isReadOnly: el.isReadOnly ?? false,
        description: el.description,
        group: el.group,
        subgroup: el.subgroup,
        alignment: el.alignment,
        channel: el.channel,
        groupSet: el.groupSet,
        rtmPlotType: el.rtmPlotType,
        copySrc: el.copySrc,
        copySrcInfoList: el.copySrcInfoList,
        displayType: el.displayType,
        policy: el.policy,
        template: buildTemplateSchema(
          el.template.elements,
          el.name ?? arrayName,
        ),
        length: el.arrayLength,
        arrayLenFormulaStr: el.arrayLenFormulaStr,
      };
  }
}

/**
 * Parses a single array item using the template element definition.
 * For single-element templates the item is parsed directly, with an auto-generated
 * `<arrayName>[index]` name when the template element has no explicit name.
 * For multi-element templates the item is parsed as an anonymous struct.
 */
function parseTemplateItem(
  templateElements: DefinitionElement[],
  reader: BinaryDataReader,
  parsedSoFar: ParsedElementData[],
  arrayName: string,
  index: number,
): ParsedElementData {
  if (templateElements.length === 1) {
    const el = templateElements[0];
    const namedEl: DefinitionElement = {
      ...el,
      name: el.name ?? `${arrayName}[${index}]`,
    };
    return parseElement(namedEl, reader, parsedSoFar);
  }
  const children: ParsedElementData[] = [];
  for (const child of templateElements) {
    children.push(
      parseElement(child, reader, [...parsedSoFar, ...children]),
    );
  }
  return {
    type: PARAMETER_ELEMENT_TYPE.Struct,
    name: `${arrayName}[${index}]`,
    isReadOnly: false,
    structureType: '',
    value: children,
  };
}

/**
 * Resolves an `arrayLenFormulaStr` expression to a concrete array length by
 * building a variable map from previously parsed `ConfigElement` values and
 * delegating to `evaluateFormula`. Returns `0` on any error.
 */
function computeArrayLength(
  formula: string,
  parsedElements: ParsedElementData[],
): number {
  const trimmed = formula.trim();
  if (!trimmed) return 0;

  const variables = new Map<string, number>();
  for (const el of parsedElements) {
    if (el.type === PARAMETER_ELEMENT_TYPE.ConfigElement) {
      const num = Number.parseFloat(el.value);
      if (!Number.isNaN(num)) {
        variables.set(el.name, num);
      }
    }
  }

  try {
    return Math.trunc(evaluateFormula(trimmed, variables));
  } catch {
    return 0;
  }
}
