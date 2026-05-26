/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {ParamStructureZodSchema} from './param-structure.schema.js';
import type {
  DefinitionElement,
  ConfigElement,
  StructElement,
  ElementArray,
} from './param-structure.schema.js';
import type {
  ParsedElementData,
  ParsedElementSchema,
  ConfigElementData,
  StructData,
  ElementArrayData,
} from './parsed-element-data.js';

/**
 * Sequential binary reader that advances an internal offset after each read.
 *
 * Wraps a `DataView` over a `Uint8Array` and provides typed read methods for
 * all scalar data types supported by the parameter structure schema.
 * All multi-byte reads use little-endian byte order.
 */
class BinaryDataReader {
  private readonly view: DataView;
  private offset = 0;

  constructor(data: Uint8Array) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  readUInt8(): number {
    if (this.offset + 1 > this.view.byteLength)
      throw new Error('Buffer overflow');
    return this.view.getUint8(this.offset++);
  }
  readUInt16(): number {
    if (this.offset + 2 > this.view.byteLength)
      throw new Error('Buffer overflow');
    const v = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return v;
  }
  readUInt32(): number {
    if (this.offset + 4 > this.view.byteLength)
      throw new Error('Buffer overflow');
    const v = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return v;
  }
  readInt8(): number {
    if (this.offset + 1 > this.view.byteLength)
      throw new Error('Buffer overflow');
    return this.view.getInt8(this.offset++);
  }
  readInt16(): number {
    if (this.offset + 2 > this.view.byteLength)
      throw new Error('Buffer overflow');
    const v = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return v;
  }
  readInt32(): number {
    if (this.offset + 4 > this.view.byteLength)
      throw new Error('Buffer overflow');
    const v = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return v;
  }
  readFloat(): number {
    if (this.offset + 4 > this.view.byteLength)
      throw new Error('Buffer overflow');
    const v = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return v;
  }
  readDouble(): number {
    if (this.offset + 8 > this.view.byteLength)
      throw new Error('Buffer overflow');
    const v = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return v;
  }
  /**
   * Reads all remaining bytes as a raw byte slice without copying.
   * Used for `RawData` elements that consume the rest of the payload.
   */
  readRawData(length: number): Uint8Array {
    if (this.offset + length > this.view.byteLength)
      throw new Error('Buffer overflow');
    const d = new Uint8Array(
      this.view.buffer,
      this.view.byteOffset + this.offset,
      length,
    );
    this.offset += length;
    return d;
  }
  /** Returns the number of bytes not yet consumed by the reader. */
  getRemainingBytes(): number {
    return this.view.byteLength - this.offset;
  }
}

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
 * Zod validation failure, buffer overflow, unknown element type).
 */
function rawFallback(payload: Uint8Array): ConfigElementData {
  return {
    type: 'CONFIG_ELEMENT',
    name: '_raw',
    isReadOnly: true,
    dataType: 'RawData',
    value: toHex(payload),
  };
}

/**
 * Recursive descent expression evaluator for `arrayLenFormulaStr` expressions.
 *
 * Supported syntax:
 * - Arithmetic operators: `+`, `-`, `*`, `/`
 * - Parentheses for grouping: `(expr)` or `[expr]`
 * - Unary minus: `-expr`
 * - Integer and decimal literals: `42`, `3.14`
 * - Variables: any identifier resolved from previously parsed `ConfigElement` values
 * - Constants: `e` (Euler's number ≈ 2.718)
 * - Functions: `log(x)` (base-10 logarithm), `ln(x)` (natural log), `sqrt(x)`
 *
 * Returns `0` on any parse or evaluation error (e.g. unknown variable, division by zero).
 */
class FormulaEvaluator {
  private pos = 0;

  constructor(
    private readonly formula: string,
    private readonly variables: Map<string, number>,
  ) {}

  /** Evaluates the full formula and returns the numeric result. */
  evaluate(): number {
    const result = this.parseExpression();
    this.skipWhitespace();
    if (this.pos < this.formula.length) {
      throw new Error(
        `Unexpected character at position ${this.pos}: '${this.formula[this.pos]}'`,
      );
    }
    return result;
  }

  private skipWhitespace(): void {
    while (
      this.pos < this.formula.length &&
      /\s/.test(this.formula[this.pos])
    ) {
      this.pos++;
    }
  }

  /** expression = term (('+' | '-') term)* */
  private parseExpression(): number {
    let left = this.parseTerm();
    this.skipWhitespace();
    while (
      this.pos < this.formula.length &&
      (this.formula[this.pos] === '+' || this.formula[this.pos] === '-')
    ) {
      const op = this.formula[this.pos++];
      this.skipWhitespace();
      const right = this.parseTerm();
      left = op === '+' ? left + right : left - right;
      this.skipWhitespace();
    }
    return left;
  }

  /** term = factor (('*' | '/') factor)* */
  private parseTerm(): number {
    let left = this.parseFactor();
    this.skipWhitespace();
    while (
      this.pos < this.formula.length &&
      (this.formula[this.pos] === '*' || this.formula[this.pos] === '/')
    ) {
      const op = this.formula[this.pos++];
      this.skipWhitespace();
      const right = this.parseFactor();
      if (op === '/' && right === 0) throw new Error('Division by zero');
      left = op === '*' ? left * right : left / right;
      this.skipWhitespace();
    }
    return left;
  }

  /** factor = number | identifier | '(' expression ')' | '-' factor */
  private parseFactor(): number {
    this.skipWhitespace();

    // Unary minus
    if (this.pos < this.formula.length && this.formula[this.pos] === '-') {
      this.pos++;
      return -this.parseFactor();
    }

    // Parenthesised or bracketed sub-expression: '(' expr ')' or '[' expr ']'
    if (
      this.pos < this.formula.length &&
      (this.formula[this.pos] === '(' || this.formula[this.pos] === '[')
    ) {
      const open = this.formula[this.pos];
      const close = open === '(' ? ')' : ']';
      this.pos++;
      const result = this.parseExpression();
      this.skipWhitespace();
      if (this.pos >= this.formula.length || this.formula[this.pos] !== close) {
        throw new Error(`Expected '${close}' to close '${open}'`);
      }
      this.pos++;
      return result;
    }

    // Numeric literal
    if (
      this.pos < this.formula.length &&
      /[0-9.]/.test(this.formula[this.pos])
    ) {
      return this.parseNumber();
    }

    // Identifier: variable, constant, or function call
    if (
      this.pos < this.formula.length &&
      /[a-zA-Z_]/.test(this.formula[this.pos])
    ) {
      return this.parseIdentifier();
    }

    throw new Error(
      `Unexpected token at position ${this.pos}: '${this.formula[this.pos] ?? 'EOF'}'`,
    );
  }

  private parseNumber(): number {
    let numStr = '';
    while (
      this.pos < this.formula.length &&
      /[0-9.]/.test(this.formula[this.pos])
    ) {
      numStr += this.formula[this.pos++];
    }
    const num = Number.parseFloat(numStr);
    if (Number.isNaN(num)) throw new Error(`Invalid number: ${numStr}`);
    return num;
  }

  private parseIdentifier(): number {
    let name = '';
    while (
      this.pos < this.formula.length &&
      /\w/.test(this.formula[this.pos])
    ) {
      name += this.formula[this.pos++];
    }
    this.skipWhitespace();

    // Function call: name '(' arg ')'
    if (this.pos < this.formula.length && this.formula[this.pos] === '(') {
      this.pos++;
      const arg = this.parseExpression();
      this.skipWhitespace();
      if (this.pos >= this.formula.length || this.formula[this.pos] !== ')') {
        throw new Error(`Expected ')' after argument of function '${name}'`);
      }
      this.pos++;
      switch (name) {
        case 'log':
          return Math.log10(arg);
        case 'ln':
          return Math.log(arg);
        case 'sqrt':
          return Math.sqrt(arg);
        default:
          throw new Error(`Unknown function: ${name}`);
      }
    }

    // Built-in constants
    if (name === 'e') return Math.E;
    if (name === 'pi') return Math.PI;

    // Variable lookup
    const value = this.variables.get(name);
    if (value === undefined) throw new Error(`Unknown variable: ${name}`);
    return value;
  }
}

/**
 * Parses binary parameter payloads into structured `ParsedElementData` trees.
 *
 * The parser reads a binary `payload` sequentially according to the JSON
 * `paramStructure` schema stored in `SpfModuleParameterDefinitionRow.paramStructure`.
 * The schema is validated with Zod before parsing begins.
 *
 * Supported element types:
 * - `ConfigElement` — scalar value (UInt8/16/32, Int8/16/32, Float, Double, RawData)
 * - `Struct` — named group of child elements parsed in order
 * - `ElementArray` — fixed-length or formula-driven array of a template element
 *
 * On any error (malformed JSON, Zod failure, buffer overflow, unknown type),
 * the parser returns a single `_raw` `ConfigElementData` containing the full
 * payload as a hex string rather than throwing.
 */
export class ParameterDataParser {
  /**
   * Entry point. Parses `payload` bytes according to the `paramStructure` JSON schema.
   *
   * @param payload - Raw binary data from `CkvParameterPayloadRow.payload`
   * @param paramStructure - JSON string from `SpfModuleParameterDefinitionRow.paramStructure`
   * @returns Array of parsed elements, or a single `_raw` fallback on any error
   */
  static parseParameterData(
    payload: Uint8Array,
    paramStructure: string,
  ): ParsedElementData[] {
    try {
      const rawJson: unknown = JSON.parse(paramStructure);
      const result = ParamStructureZodSchema.safeParse(rawJson);
      if (!result.success) return [rawFallback(payload)];

      const reader = new BinaryDataReader(payload);
      const parsed: ParsedElementData[] = [];
      for (const element of result.data) {
        parsed.push(ParameterDataParser.parseElement(element, reader, parsed));
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
  private static parseElement(
    element: DefinitionElement,
    reader: BinaryDataReader,
    parsedSoFar: ParsedElementData[],
  ): ParsedElementData {
    switch (element.elementType) {
      case 'ConfigElement':
        return ParameterDataParser.parseConfigElement(element, reader);
      case 'Struct':
        return ParameterDataParser.parseStruct(element, reader, parsedSoFar);
      case 'ElementArray':
        return ParameterDataParser.parseElementArray(
          element,
          reader,
          parsedSoFar,
        );
    }
  }

  /**
   * Reads a single scalar value from the binary stream and wraps it in a
   * `ConfigElementData`. The value is stored as a string to match the DTO contract.
   * For `RawData`, all remaining bytes are consumed and stored as a comma-separated
   * decimal string.
   */
  private static parseConfigElement(
    element: ConfigElement,
    reader: BinaryDataReader,
  ): ConfigElementData {
    const raw = ParameterDataParser.readScalar(element.dataType, reader);
    const value =
      raw instanceof Uint8Array ? [...raw].toString() : raw.toString();
    return {
      type: 'CONFIG_ELEMENT',
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
      value,
    };
  }

  /** Reads the next scalar value of the given `dataType` from the binary stream. */
  // eslint-disable-next-line sonarjs/function-return-type
  private static readScalar(
    dataType: string,
    reader: BinaryDataReader,
  ): number | Uint8Array {
    switch (dataType) {
      case 'UInt8':
        return reader.readUInt8();
      case 'UInt16':
        return reader.readUInt16();
      case 'UInt32':
        return reader.readUInt32();
      case 'Int8':
        return reader.readInt8();
      case 'Int16':
        return reader.readInt16();
      case 'Int32':
        return reader.readInt32();
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
  private static parseStruct(
    element: StructElement,
    reader: BinaryDataReader,
    parsedSoFar: ParsedElementData[],
  ): StructData {
    const children: ParsedElementData[] = [];
    for (const child of element.elements) {
      children.push(
        ParameterDataParser.parseElement(child, reader, [
          ...parsedSoFar,
          ...children,
        ]),
      );
    }
    return {
      type: 'STRUCT',
      name: element.name,
      description: element.description,
      isReadOnly: false,
      structureType: element.structureType,
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
  private static parseElementArray(
    element: ElementArray,
    reader: BinaryDataReader,
    parsedSoFar: ParsedElementData[],
  ): ElementArrayData {
    const length =
      element.arrayLength ??
      ParameterDataParser.evaluateFormula(
        element.arrayLenFormulaStr ?? '',
        parsedSoFar,
      );

    const templateElements = element.template.elements;
    const arrayName = element.name;

    const templateSchema = ParameterDataParser.buildTemplateSchema(
      templateElements,
      arrayName,
    );

    const items: ParsedElementData[] = [];
    for (let i = 0; i < length; i++) {
      const item = ParameterDataParser.parseTemplateItem(
        templateElements,
        reader,
        [...parsedSoFar, ...items],
        arrayName,
        i,
      );
      items.push(item);
    }

    return {
      type: 'ELEMENT_ARRAY',
      name: arrayName,
      description: element.description,
      isReadOnly: false,
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
   * The `children` / `template` fields are left empty — they describe structure,
   * not values.
   */
  private static buildTemplateSchema(
    templateElements: DefinitionElement[],
    arrayName: string,
  ): ParsedElementSchema {
    if (templateElements.length === 1) {
      const el = templateElements[0];
      return ParameterDataParser.buildSingleElementSchema(el, arrayName);
    }
    // Multi-element template: wrap in a synthetic struct schema
    return {
      type: 'STRUCT',
      name: arrayName,
      isReadOnly: false,
      structureType: '',
      children: [],
    };
  }

  private static buildSingleElementSchema(
    el: DefinitionElement,
    arrayName: string,
  ): ParsedElementSchema {
    const name = el.name ?? arrayName;
    switch (el.elementType) {
      case 'ConfigElement': {
        const s: ParsedElementSchema = {
          type: 'CONFIG_ELEMENT',
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
        };
        return s;
      }
      case 'Struct': {
        const s: ParsedElementSchema = {
          type: 'STRUCT',
          name,
          isReadOnly: false,
          description: el.description,
          structureType: el.structureType,
          children: [],
        };
        return s;
      }
      default: {
        const s: ParsedElementSchema = {
          type: 'ELEMENT_ARRAY',
          name,
          isReadOnly: false,
          description: el.description,
          template: ParameterDataParser.buildTemplateSchema(
            el.template.elements,
            el.name ?? arrayName,
          ),
          length: el.arrayLength,
          arrayLenFormulaStr: el.arrayLenFormulaStr,
        };
        return s;
      }
    }
  }

  /**
   * Parses a single array item using the template element definition.
   * For single-element templates the item is parsed directly, with an auto-generated
   * `<arrayName>[index]` name when the template element has no explicit name.
   * For multi-element templates the item is parsed as an anonymous struct.
   */
  private static parseTemplateItem(
    templateElements: DefinitionElement[],
    reader: BinaryDataReader,
    parsedSoFar: ParsedElementData[],
    arrayName: string,
    index: number,
  ): ParsedElementData {
    if (templateElements.length === 1) {
      const el = templateElements[0];
      // Generate indexed name if the template element has no explicit name
      const namedEl: DefinitionElement = {
        ...el,
        name: el.name ?? `${arrayName}[${index}]`,
      };
      return ParameterDataParser.parseElement(namedEl, reader, parsedSoFar);
    }
    // Multi-element template: parse each child and wrap in a struct
    const children: ParsedElementData[] = [];
    for (const child of templateElements) {
      children.push(
        ParameterDataParser.parseElement(child, reader, [
          ...parsedSoFar,
          ...children,
        ]),
      );
    }
    return {
      type: 'STRUCT',
      name: `${arrayName}[${index}]`,
      isReadOnly: false,
      structureType: '',
      value: children,
    };
  }

  /**
   * Evaluates an `arrayLenFormulaStr` expression against previously parsed elements.
   *
   * Variable names in the formula are resolved by looking up `ConfigElement` values
   * from `parsedElements` by name. The result is truncated to an integer (array
   * lengths must be whole numbers). Returns `0` on any parse or evaluation error.
   *
   * @example
   * // formula = "count*2", parsedElements contains {name:"count", value:"3"}
   * // → evaluates "3*2" → returns 6
   */
  private static evaluateFormula(
    formula: string,
    parsedElements: ParsedElementData[],
  ): number {
    const trimmed = formula.trim();
    if (!trimmed) return 0;

    // Build variable map from all previously parsed ConfigElement values
    const variables = new Map<string, number>();
    for (const el of parsedElements) {
      if (el.type === 'CONFIG_ELEMENT') {
        const num = Number.parseFloat(el.value);
        if (!Number.isNaN(num)) {
          variables.set(el.name, num);
        }
      }
    }

    try {
      const result = new FormulaEvaluator(trimmed, variables).evaluate();
      return Math.trunc(result);
    } catch {
      return 0;
    }
  }
}
