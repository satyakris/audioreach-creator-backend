import {jest} from '@jest/globals';
import {GetCkvCalibrationDataHandler} from '../../../../../../src/application/usecase-designer/spf-module/get-cal-data/get-ckv-cal-data.handler.js';
import {GetCkvCalibrationDataQuery} from '../../../../../../src/application/usecase-designer/spf-module/get-cal-data/get-ckv-cal-data.query.js';
import type {QueryServices} from '../../../../../../src/application/services/query-services.js';
import type {
  CkvReadModel,
  ParameterPayloadReadModel,
} from '../../../../../../src/application/services/spf-module/ckv/ckv-read-model.js';
import type {ParameterDefinitionReadModel} from '../../../../../../src/application/services/spf-module-definition/parameter-definition/parameter-definition-read-model.js';
import {CHANGE_OPERATION} from '../../../../../../src/application/shared/change-vocabulary.js';
import {PARAMETER_ELEMENT_TYPE} from '../../../../../../src/application/usecase-designer/spf-module/param-parser/types/element-definition.js';
import {ParameterDefinitionMissingError} from '../../../../../../src/shared/errors/parameter-definition-missing.error.js';

const NONE = {changeType: CHANGE_OPERATION.None};

const mockCkv: CkvReadModel = {
  systemId: 10,
  changeInfo: NONE,
  spfModuleSystemId: 1,
  uiPersistence: null,
  keyValuePairs: [],
};

const mockPayload: ParameterPayloadReadModel = {
  systemId: 20,
  changeInfo: NONE,
  parameterSystemId: 100,
  payload: new Uint8Array([0x05, 0x00, 0x00, 0x00]),
};

const mockDef: ParameterDefinitionReadModel = {
  systemId: 100,
  changeInfo: NONE,
  parameterId: 42,
  name: 'gain',
  paramStructure: JSON.stringify([
    {
      elementType: 'ConfigElement',
      name: 'gain',
      dataType: 'UInt32',
      isReadOnly: false,
    },
  ]),
  isReadOnly: false,
  pidType: 'PARAM_ID_GAIN',
};

function makeServices(
  overrides: {
    fileId?: number;
    moduleDefId?: number;
    ckv?: CkvReadModel | null;
    payloads?: ParameterPayloadReadModel[];
    defs?: ParameterDefinitionReadModel[];
  } = {},
): QueryServices {
  const {
    fileId = 5,
    moduleDefId = 50,
    ckv = mockCkv,
    payloads = [mockPayload],
    defs = [mockDef],
  } = overrides;
  return {
    projectQueryService: {
      getFileIdByProjectId: jest.fn().mockResolvedValue(fileId),
    },
    spfModuleQueryService: {
      getModuleDefinitionSystemId: jest.fn().mockResolvedValue(moduleDefId),
      ckvQueryService: {
        getCkv: jest.fn().mockResolvedValue(ckv),
        getCkvPayloads: jest.fn().mockResolvedValue(payloads),
      },
    },
    spfModuleDefinitionQueryService: {
      parameterDefinitionQueryService: {
        getParameterDefinitions: jest.fn().mockResolvedValue(defs),
      },
    },
    modulesQueryService: {} as any,
    useCaseQueryService: {} as any,
    validationQueryService: {} as any,
  } as unknown as QueryServices;
}

describe('GetCkvCalibrationDataHandler', () => {
  it('returns CkvCalibrationReadModel with parsed parameters', async () => {
    const handler = new GetCkvCalibrationDataHandler(makeServices());
    const query = new GetCkvCalibrationDataQuery('1', '2', '10', 'client-id');
    const result = await handler.handle(query);

    expect(result.ckv).toBe(mockCkv);
    expect(result.parameters).toHaveLength(1);
    expect(result.parameters[0].name).toBe('gain');
    expect(result.parameters[0].parsedData).not.toBeNull();
    expect(result.parameters[0].parsedData![0]).toMatchObject({
      type: PARAMETER_ELEMENT_TYPE.ConfigElement,
      name: 'gain',
      value: '5',
    });
  });

  it('sets parsedData to null when payload is null', async () => {
    const handler = new GetCkvCalibrationDataHandler(
      makeServices({payloads: [{...mockPayload, payload: null}]}),
    );
    const result = await handler.handle(
      new GetCkvCalibrationDataQuery('1', '2', '10', 'client-id'),
    );
    expect(result.parameters[0].parsedData).toBeNull();
  });

  it('throws when CKV is not found', async () => {
    const handler = new GetCkvCalibrationDataHandler(makeServices({ckv: null}));
    await expect(
      handler.handle(
        new GetCkvCalibrationDataQuery('1', '2', '10', 'client-id'),
      ),
    ).rejects.toThrow();
  });

  it('propagates changeInfo from payload to output model', async () => {
    const handler = new GetCkvCalibrationDataHandler(
      makeServices({
        payloads: [
          {
            ...mockPayload,
            changeInfo: {
              changeType: CHANGE_OPERATION.Update,
              changeId: 99,
              changeStatus: 'STAGED',
            },
          },
        ],
      }),
    );
    const result = await handler.handle(
      new GetCkvCalibrationDataQuery('1', '2', '10', 'client-id'),
    );
    expect(result.parameters[0].changeInfo).toMatchObject({
      changeType: 'UPDATE',
      changeId: 99,
    });
  });

  it('throws ParameterDefinitionMissingError when payload exists but definition is missing', async () => {
    const handler = new GetCkvCalibrationDataHandler(makeServices({defs: []}));
    await expect(
      handler.handle(
        new GetCkvCalibrationDataQuery('1', '2', '10', 'client-id'),
      ),
    ).rejects.toThrow(ParameterDefinitionMissingError);
  });

  it('joins payloads to definitions by parameterSystemId → systemId', async () => {
    const handler = new GetCkvCalibrationDataHandler(makeServices());
    const result = await handler.handle(
      new GetCkvCalibrationDataQuery('1', '2', '10', 'client-id'),
    );
    // mockPayload.parameterSystemId = 100, mockDef.systemId = 100 → should match
    expect(result.parameters[0].parameterId).toBe(42);
  });
});
