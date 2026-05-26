/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../services/query-services.js';
import type {GetCkvCalibrationDataQuery} from './get-ckv-cal-data.query.js';
import type {
  CkvCalibrationDataModel,
  ParameterCalibrationDataModel,
} from './ckv-calibration-read-model.js';
import type {ParameterCalibrationReadModel} from '../../../services/spf-module/ckv/ckv-read-model.js';
import type {ParameterDefinitionReadModel} from '../../../services/spf-module-definition/parameter-definition/parameter-definition-read-model.js';
import {ParameterDataParser} from './common/parameter-data-parser.js';
import type {ParsedElementData} from './common/parsed-element-data.js';

/**
 * Handles `GetCkvCalibrationDataQuery` by fetching CKV data, parameter payloads,
 * and parameter definitions in parallel, then merging them into a
 * `CkvCalibrationDataModel` with fully parsed binary payloads.
 *
 * Fetch strategy:
 * 1. Resolve `fileSystemId` from `projectId` via `ProjectQueryService`
 * 2. Resolve `moduleDefSystemId` from `spfModuleSystemId` via `SpfModuleQueryService`
 * 3. Fetch CKV row, payload rows, and definition rows in parallel (`Promise.all`)
 * 4. Join payloads to definitions by `parameterSystemId → systemId`
 * 5. Parse each non-null payload with `ParameterDataParser`
 */
export class GetCkvCalibrationDataHandler implements QueryHandler<
  GetCkvCalibrationDataQuery,
  Promise<CkvCalibrationDataModel>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetCkvCalibrationDataQuery,
  ): Promise<CkvCalibrationDataModel> {
    // Step 1: resolve file system ID from project ID
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    // Step 2: resolve module definition system ID from SPF module system ID
    const moduleDefSystemId =
      await this.queryServices.spfModuleQueryService.getModuleDefinitionSystemId(
        query.spfModuleSystemId,
      );

    // Step 3: fetch CKV, payloads, and definitions in parallel
    const [ckv, payloads, parameterDefinitions] = await Promise.all([
      this.queryServices.spfModuleQueryService.ckvQueryService.getCkv(
        fileSystemId,
        query.ckvSystemId,
      ),
      this.queryServices.spfModuleQueryService.ckvQueryService.getCkvPayloads(
        fileSystemId,
        query.ckvSystemId,
        query.paramSystemIds,
      ),
      this.queryServices.spfModuleDefinitionQueryService.parameterDefinitionQueryService.getParameterDefinitions(
        fileSystemId,
        moduleDefSystemId,
        query.paramSystemIds,
      ),
    ]);

    if (!ckv) {
      throw new Error(`CKV not found: systemId=${query.ckvSystemId}`);
    }

    return {
      ckv,
      parameters: this.buildParameterDataModels(payloads, parameterDefinitions),
    };
  }

  /**
   * Joins payload rows to definition rows by `parameterSystemId → systemId`,
   * then parses each non-null payload with `ParameterDataParser`.
   *
   * When no matching definition exists for a payload, safe defaults are used
   * (`name: ''`, `parsedData: null`) so the response is never incomplete.
   */
  private buildParameterDataModels(
    payloads: ParameterCalibrationReadModel[],
    definitions: ParameterDefinitionReadModel[],
  ): ParameterCalibrationDataModel[] {
    // Index definitions by their PK (systemId) for O(1) lookup
    const defMap = new Map(definitions.map(d => [d.systemId, d]));

    return payloads.map(p => {
      const def = defMap.get(p.parameterSystemId);

      let parsedData: ParsedElementData[] | null = null;
      if (p.payload !== null && def !== undefined) {
        parsedData = ParameterDataParser.parseParameterData(
          p.payload,
          def.paramStructure,
        );
      }

      return {
        parameterSystemId: p.systemId,
        changeInfo: p.changeInfo,
        parameterId: def?.parameterId ?? 0,
        name: def?.name ?? '',
        description: def?.description,
        isReadOnly: def?.isReadOnly ?? false,
        isHidden: undefined,
        pidType: def?.pidType ?? '',
        parsedData,
      };
    });
  }
}
