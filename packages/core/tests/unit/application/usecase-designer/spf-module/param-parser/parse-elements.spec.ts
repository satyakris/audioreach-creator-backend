/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {parseParameterData} from '../../../../../../src/application/usecase-designer/spf-module/param-parser/parse-elements.js';
import type {
  ConfigElementData,
  ElementArrayData,
  StructData,
} from '../../../../../../src/application/usecase-designer/spf-module/param-parser/types/parsed-element-data.js';
import {PARAMETER_ELEMENT_TYPE} from '../../../../../../src/application/usecase-designer/spf-module/param-parser/types/element-definition.js';

describe('parseParameterData', () => {
  describe('ConfigElement', () => {
    it('parses UInt32 scalar', () => {
      const payload = new Uint8Array([0x05, 0x00, 0x00, 0x00]);
      const structure = JSON.stringify([
        {
          elementType: 'ConfigElement',
          name: 'gain',
          dataType: 'UInt32',
          isReadOnly: false,
        },
      ]);
      const result = parseParameterData(payload, structure);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: PARAMETER_ELEMENT_TYPE.ConfigElement,
        name: 'gain',
        value: '5',
        isReadOnly: false,
      });
    });

    it('parses Int16 negative value', () => {
      const payload = new Uint8Array([0xff, 0xff]); // -1 as little-endian Int16
      const structure = JSON.stringify([
        {
          elementType: 'ConfigElement',
          name: 'offset',
          dataType: 'Int16',
          isReadOnly: false,
        },
      ]);
      const result = parseParameterData(payload, structure);
      expect(result[0]).toMatchObject({
        type: PARAMETER_ELEMENT_TYPE.ConfigElement,
        name: 'offset',
        value: '-1',
      });
    });

    it('parses Float value', () => {
      const buf = new ArrayBuffer(4);
      new DataView(buf).setFloat32(0, 1.5, true);
      const payload = new Uint8Array(buf);
      const structure = JSON.stringify([
        {
          elementType: 'ConfigElement',
          name: 'freq',
          dataType: 'Float',
          isReadOnly: false,
        },
      ]);
      const result = parseParameterData(payload, structure);
      expect(result[0].type).toBe(PARAMETER_ELEMENT_TYPE.ConfigElement);
      expect(parseFloat((result[0] as ConfigElementData).value)).toBeCloseTo(
        1.5,
      );
    });

    it('parses RawData', () => {
      const payload = new Uint8Array([0x01, 0x02, 0x03]);
      const structure = JSON.stringify([
        {
          elementType: 'ConfigElement',
          name: 'raw',
          dataType: 'RawData',
          isReadOnly: false,
        },
      ]);
      const result = parseParameterData(payload, structure);
      expect(result[0]).toMatchObject({
        type: PARAMETER_ELEMENT_TYPE.ConfigElement,
        name: 'raw',
      });
    });

    it('generates name for template element with no name', () => {
      const payload = new Uint8Array([
        0x01, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00,
      ]);
      const structure = JSON.stringify([
        {
          elementType: 'ElementArray',
          name: 'filter_coeffs',
          arrayLength: 2,
          template: {
            elements: [
              {
                elementType: 'ConfigElement',
                dataType: 'UInt32',
                isReadOnly: false,
              },
            ],
          },
        },
      ]);
      const result = parseParameterData(payload, structure);
      const arr = result[0] as ElementArrayData;
      expect(arr.template.name).toBe('filter_coeffs');
      expect(arr.value[0].name).toBe('filter_coeffs[0]');
      expect(arr.value[1].name).toBe('filter_coeffs[1]');
    });
  });

  describe(PARAMETER_ELEMENT_TYPE.Struct, () => {
    it('parses flat struct with two children', () => {
      const payload = new Uint8Array([
        0x01, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00,
      ]);
      const structure = JSON.stringify([
        {
          elementType: PARAMETER_ELEMENT_TYPE.Struct,
          name: 'filter',
          isReadOnly: false,
          structureType: 'filter_t',
          elements: [
            {
              elementType: 'ConfigElement',
              name: 'freq',
              dataType: 'UInt32',
              isReadOnly: false,
            },
            {
              elementType: 'ConfigElement',
              name: 'gain',
              dataType: 'UInt32',
              isReadOnly: false,
            },
          ],
        },
      ]);
      const result = parseParameterData(payload, structure);
      expect(result[0]).toMatchObject({
        type: PARAMETER_ELEMENT_TYPE.Struct,
        name: 'filter',
      });
      const s = result[0] as StructData;
      expect(s.value).toHaveLength(2);
      expect(s.value[0]).toMatchObject({
        type: PARAMETER_ELEMENT_TYPE.ConfigElement,
        name: 'freq',
        value: '1',
      });
    });

    it('parses nested struct', () => {
      const payload = new Uint8Array([0x0a, 0x00, 0x00, 0x00]);
      const structure = JSON.stringify([
        {
          elementType: PARAMETER_ELEMENT_TYPE.Struct,
          name: 'outer',
          isReadOnly: false,
          structureType: 'outer_t',
          elements: [
            {
              elementType: PARAMETER_ELEMENT_TYPE.Struct,
              name: 'inner',
              isReadOnly: false,
              structureType: 'inner_t',
              elements: [
                {
                  elementType: 'ConfigElement',
                  name: 'val',
                  dataType: 'UInt32',
                  isReadOnly: false,
                },
              ],
            },
          ],
        },
      ]);
      const result = parseParameterData(payload, structure);
      const outer = result[0] as StructData;
      const inner = outer.value[0] as StructData;
      expect(inner.type).toBe(PARAMETER_ELEMENT_TYPE.Struct);
      expect((inner.value[0] as ConfigElementData).value).toBe('10');
    });
  });

  describe('ElementArray', () => {
    it('parses static-length array of UInt16', () => {
      const payload = new Uint8Array([0x01, 0x00, 0x02, 0x00, 0x03, 0x00]);
      const structure = JSON.stringify([
        {
          elementType: 'ElementArray',
          name: 'coeff',
          arrayLength: 3,
          template: {
            elements: [
              {
                elementType: 'ConfigElement',
                name: 'coeff',
                dataType: 'UInt16',
                isReadOnly: false,
              },
            ],
          },
        },
      ]);
      const result = parseParameterData(payload, structure);
      expect(result[0]).toMatchObject({
        type: PARAMETER_ELEMENT_TYPE.ElementArray,
        name: 'coeff',
        length: 3,
      });
      const arr = result[0] as ElementArrayData;
      expect(arr.value).toHaveLength(3);
      expect((arr.value[0] as ConfigElementData).value).toBe('1');
    });

    it('parses array of structs', () => {
      const payload = new Uint8Array([0x0a, 0x14]);
      const structure = JSON.stringify([
        {
          elementType: 'ElementArray',
          name: 'bands',
          arrayLength: 2,
          template: {
            elements: [
              {
                elementType: PARAMETER_ELEMENT_TYPE.Struct,
                name: 'band',
                isReadOnly: false,
                structureType: 'band_t',
                elements: [
                  {
                    elementType: 'ConfigElement',
                    name: 'val',
                    dataType: 'UInt8',
                    isReadOnly: false,
                  },
                ],
              },
            ],
          },
        },
      ]);
      const result = parseParameterData(payload, structure);
      const arr = result[0] as ElementArrayData;
      expect(arr.value[0].type).toBe(PARAMETER_ELEMENT_TYPE.Struct);
    });

    it('parses nested ElementArray', () => {
      const payload = new Uint8Array([0x01, 0x00, 0x02, 0x00]);
      const structure = JSON.stringify([
        {
          elementType: 'ElementArray',
          name: 'outer',
          arrayLength: 2,
          template: {
            elements: [
              {
                elementType: 'ElementArray',
                name: 'inner',
                arrayLength: 1,
                template: {
                  elements: [
                    {
                      elementType: 'ConfigElement',
                      name: 'val',
                      dataType: 'UInt16',
                      isReadOnly: false,
                    },
                  ],
                },
              },
            ],
          },
        },
      ]);
      const result = parseParameterData(payload, structure);
      const outer = result[0] as ElementArrayData;
      expect(outer.value[0].type).toBe(PARAMETER_ELEMENT_TYPE.ElementArray);
    });

    it('resolves formula-driven array length from previously parsed element', () => {
      const payload = new Uint8Array([
        0x03, 0x00, 0x01, 0x00, 0x02, 0x00, 0x03, 0x00,
      ]);
      const structure = JSON.stringify([
        {
          elementType: 'ConfigElement',
          name: 'count',
          dataType: 'UInt16',
          isReadOnly: false,
        },
        {
          elementType: 'ElementArray',
          name: 'data',
          arrayLenFormulaStr: 'count',
          template: {
            elements: [
              {
                elementType: 'ConfigElement',
                name: 'data',
                dataType: 'UInt16',
                isReadOnly: false,
              },
            ],
          },
        },
      ]);
      const result = parseParameterData(payload, structure);
      const arr = result[1] as ElementArrayData;
      expect(arr.length).toBe(3);
      expect(arr.value).toHaveLength(3);
    });
  });

  describe('error fallback', () => {
    it('returns _raw on buffer overflow', () => {
      const payload = new Uint8Array([0x01, 0x00]); // only 2 bytes, needs 4
      const structure = JSON.stringify([
        {
          elementType: 'ConfigElement',
          name: 'gain',
          dataType: 'UInt32',
          isReadOnly: false,
        },
      ]);
      const result = parseParameterData(payload, structure);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: PARAMETER_ELEMENT_TYPE.ConfigElement,
        name: '_raw',
        isReadOnly: true,
        value: '0100',
      });
    });

    it('returns _raw on malformed JSON', () => {
      const payload = new Uint8Array([0x01, 0x00, 0x00, 0x00]);
      const result = parseParameterData(payload, 'not valid json');
      expect(result[0]).toMatchObject({
        type: PARAMETER_ELEMENT_TYPE.ConfigElement,
        name: '_raw',
        isReadOnly: true,
        value: '01000000',
      });
    });

    it('returns _raw on empty payload with non-empty schema', () => {
      const payload = new Uint8Array([]);
      const structure = JSON.stringify([
        {
          elementType: 'ConfigElement',
          name: 'gain',
          dataType: 'UInt32',
          isReadOnly: false,
        },
      ]);
      const result = parseParameterData(payload, structure);
      expect(result[0]).toMatchObject({
        type: PARAMETER_ELEMENT_TYPE.ConfigElement,
        name: '_raw',
        isReadOnly: true,
        value: '',
      });
    });
  });
});
