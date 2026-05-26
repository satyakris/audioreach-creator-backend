import {ParameterDataParser} from '../../../../../../src/application/usecase-designer/spf-module/get-cal-data/common/parameter-data-parser.js';
import type {
  ConfigElementData,
  ElementArrayData,
  StructData,
} from '../../../../../../src/application/usecase-designer/spf-module/get-cal-data/common/parsed-element-data.js';

describe('ParameterDataParser.parseParameterData', () => {
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
      const result = ParameterDataParser.parseParameterData(payload, structure);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: 'CONFIG_ELEMENT',
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
      const result = ParameterDataParser.parseParameterData(payload, structure);
      expect(result[0]).toMatchObject({
        type: 'CONFIG_ELEMENT',
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
      const result = ParameterDataParser.parseParameterData(payload, structure);
      expect(result[0].type).toBe('CONFIG_ELEMENT');
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
      const result = ParameterDataParser.parseParameterData(payload, structure);
      expect(result[0]).toMatchObject({type: 'CONFIG_ELEMENT', name: 'raw'});
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
      const result = ParameterDataParser.parseParameterData(payload, structure);
      const arr = result[0] as ElementArrayData;
      expect(arr.template.name).toBe('filter_coeffs');
      expect(arr.value[0].name).toBe('filter_coeffs[0]');
      expect(arr.value[1].name).toBe('filter_coeffs[1]');
    });
  });

  describe('Struct', () => {
    it('parses flat struct with two children', () => {
      const payload = new Uint8Array([
        0x01, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00,
      ]);
      const structure = JSON.stringify([
        {
          elementType: 'Struct',
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
      const result = ParameterDataParser.parseParameterData(payload, structure);
      expect(result[0]).toMatchObject({type: 'STRUCT', name: 'filter'});
      const s = result[0] as StructData;
      expect(s.value).toHaveLength(2);
      expect(s.value[0]).toMatchObject({
        type: 'CONFIG_ELEMENT',
        name: 'freq',
        value: '1',
      });
    });

    it('parses nested struct', () => {
      const payload = new Uint8Array([0x0a, 0x00, 0x00, 0x00]);
      const structure = JSON.stringify([
        {
          elementType: 'Struct',
          name: 'outer',
          isReadOnly: false,
          structureType: 'outer_t',
          elements: [
            {
              elementType: 'Struct',
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
      const result = ParameterDataParser.parseParameterData(payload, structure);
      const outer = result[0] as StructData;
      const inner = outer.value[0] as StructData;
      expect(inner.type).toBe('STRUCT');
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
      const result = ParameterDataParser.parseParameterData(payload, structure);
      expect(result[0]).toMatchObject({
        type: 'ELEMENT_ARRAY',
        name: 'coeff',
        length: 3,
      });
      const arr = result[0] as ElementArrayData;
      expect(arr.value).toHaveLength(3);
      expect((arr.value[0] as ConfigElementData).value).toBe('1');
    });

    it('stores arrayLenFormulaStr for dynamic arrays', () => {
      const payload = new Uint8Array([0x02, 0x00, 0x01, 0x00, 0x02, 0x00]);
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
      const result = ParameterDataParser.parseParameterData(payload, structure);
      expect(result[1]).toMatchObject({
        type: 'ELEMENT_ARRAY',
        arrayLenFormulaStr: 'count',
      });
    });

    it('parses array of structs', () => {
      const payload = new Uint8Array([0x0a, 0x14]); // two UInt8 values: 10, 20
      const structure = JSON.stringify([
        {
          elementType: 'ElementArray',
          name: 'bands',
          arrayLength: 2,
          template: {
            elements: [
              {
                elementType: 'Struct',
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
      const result = ParameterDataParser.parseParameterData(payload, structure);
      const arr = result[0] as ElementArrayData;
      expect(arr.value[0].type).toBe('STRUCT');
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
      const result = ParameterDataParser.parseParameterData(payload, structure);
      const outer = result[0] as ElementArrayData;
      expect(outer.value[0].type).toBe('ELEMENT_ARRAY');
    });
  });

  describe('formula-driven array length', () => {
    it('evaluates simple variable reference', () => {
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
      const result = ParameterDataParser.parseParameterData(payload, structure);
      const arr = result[1] as ElementArrayData;
      expect(arr.length).toBe(3);
      expect(arr.value).toHaveLength(3);
    });

    it('evaluates arithmetic expression: count*2', () => {
      // count=2, array length = 2*2 = 4 items of UInt8
      const payload = new Uint8Array([0x02, 0x00, 0x0a, 0x14, 0x1e, 0x28]);
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
          arrayLenFormulaStr: 'count*2',
          template: {
            elements: [
              {
                elementType: 'ConfigElement',
                name: 'data',
                dataType: 'UInt8',
                isReadOnly: false,
              },
            ],
          },
        },
      ]);
      const result = ParameterDataParser.parseParameterData(payload, structure);
      const arr = result[1] as ElementArrayData;
      expect(arr.length).toBe(4);
      expect(arr.value).toHaveLength(4);
    });

    it('evaluates parenthesised expression: (count+1)*2', () => {
      // count=2, array length = (2+1)*2 = 6 items of UInt8
      const payload = new Uint8Array([0x02, 0x00, 1, 2, 3, 4, 5, 6]);
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
          arrayLenFormulaStr: '(count+1)*2',
          template: {
            elements: [
              {
                elementType: 'ConfigElement',
                name: 'data',
                dataType: 'UInt8',
                isReadOnly: false,
              },
            ],
          },
        },
      ]);
      const result = ParameterDataParser.parseParameterData(payload, structure);
      const arr = result[1] as ElementArrayData;
      expect(arr.length).toBe(6);
    });

    it('evaluates bracket grouping: [a*2+b*3]*5', () => {
      // a=1, b=2 → [1*2+2*3]*5 = [2+6]*5 = 8*5 = 40 items of UInt8
      const payload = new Uint8Array([1, 2, ...new Array(40).fill(0)]);
      const structure = JSON.stringify([
        {
          elementType: 'ConfigElement',
          name: 'a',
          dataType: 'UInt8',
          isReadOnly: false,
        },
        {
          elementType: 'ConfigElement',
          name: 'b',
          dataType: 'UInt8',
          isReadOnly: false,
        },
        {
          elementType: 'ElementArray',
          name: 'data',
          arrayLenFormulaStr: '[a*2+b*3]*5',
          template: {
            elements: [
              {
                elementType: 'ConfigElement',
                name: 'data',
                dataType: 'UInt8',
                isReadOnly: false,
              },
            ],
          },
        },
      ]);
      const result = ParameterDataParser.parseParameterData(payload, structure);
      const arr = result[2] as ElementArrayData;
      expect(arr.length).toBe(40);
      expect(arr.value).toHaveLength(40);
    });

    it('evaluates mixed bracket/parenthesis nesting: [(a*2+b*3)+c]*5', () => {
      // a=1, b=2, c=2 → [(1*2+2*3)+2]*5 = [(2+6)+2]*5 = 10*5 = 50 items of UInt8
      const payload = new Uint8Array([1, 2, 2, ...new Array(50).fill(0)]);
      const structure = JSON.stringify([
        {
          elementType: 'ConfigElement',
          name: 'a',
          dataType: 'UInt8',
          isReadOnly: false,
        },
        {
          elementType: 'ConfigElement',
          name: 'b',
          dataType: 'UInt8',
          isReadOnly: false,
        },
        {
          elementType: 'ConfigElement',
          name: 'c',
          dataType: 'UInt8',
          isReadOnly: false,
        },
        {
          elementType: 'ElementArray',
          name: 'data',
          arrayLenFormulaStr: '[(a*2+b*3)+c]*5',
          template: {
            elements: [
              {
                elementType: 'ConfigElement',
                name: 'data',
                dataType: 'UInt8',
                isReadOnly: false,
              },
            ],
          },
        },
      ]);
      const result = ParameterDataParser.parseParameterData(payload, structure);
      const arr = result[3] as ElementArrayData;
      expect(arr.length).toBe(50);
      expect(arr.value).toHaveLength(50);
    });

    it('returns 0 for unknown variable in formula', () => {
      const payload = new Uint8Array([0x02, 0x00]);
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
          arrayLenFormulaStr: 'unknown_var',
          template: {
            elements: [
              {
                elementType: 'ConfigElement',
                name: 'data',
                dataType: 'UInt8',
                isReadOnly: false,
              },
            ],
          },
        },
      ]);
      const result = ParameterDataParser.parseParameterData(payload, structure);
      const arr = result[1] as ElementArrayData;
      expect(arr.length).toBe(0);
      expect(arr.value).toHaveLength(0);
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
      const result = ParameterDataParser.parseParameterData(payload, structure);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: 'CONFIG_ELEMENT',
        name: '_raw',
        isReadOnly: true,
        value: '0100',
      });
    });

    it('returns _raw on malformed JSON', () => {
      const payload = new Uint8Array([0x01, 0x00, 0x00, 0x00]);
      const result = ParameterDataParser.parseParameterData(
        payload,
        'not valid json',
      );
      expect(result[0]).toMatchObject({
        type: 'CONFIG_ELEMENT',
        name: '_raw',
        isReadOnly: true,
        value: '01000000',
      });
    });

    it('returns _raw on unknown elementType', () => {
      const payload = new Uint8Array([0x01]);
      const structure = JSON.stringify([
        {
          elementType: 'UnknownType',
          name: 'x',
          dataType: 'UInt8',
          isReadOnly: false,
        },
      ]);
      const result = ParameterDataParser.parseParameterData(payload, structure);
      expect(result[0]).toMatchObject({
        type: 'CONFIG_ELEMENT',
        name: '_raw',
        isReadOnly: true,
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
      const result = ParameterDataParser.parseParameterData(payload, structure);
      expect(result[0]).toMatchObject({
        type: 'CONFIG_ELEMENT',
        name: '_raw',
        isReadOnly: true,
        value: '',
      });
    });
  });
});
