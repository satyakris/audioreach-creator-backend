/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {GetCkvCalibrationDataQuery} from './get-ckv-cal-data.query.js';
import type {
  CkvCalibrationReadModel,
  ParameterCalibrationReadModel,
} from './ckv-calibration-read-model.js';
import type {ParameterPayloadReadModel} from '../../../ports/persistence/query-services/spf-module/ckv/ckv-read-model.js';
import type {ParameterDefinitionReadModel} from '../../../ports/persistence/query-services/spf-module-definition/parameter-definition/parameter-definition-read-model.js';
import {parseParameterData} from '../param-parser/parse-elements.js';
import type {ParsedElementData} from '../param-parser/types/parsed-element-data.js';
import {EntityNotFoundError} from '../../../../shared/errors/entity-not-found.error.js';
import {ParameterDefinitionMissingError} from '../../../../shared/errors/parameter-definition-missing.error.js';

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
  Promise<CkvCalibrationReadModel>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetCkvCalibrationDataQuery,
  ): Promise<CkvCalibrationReadModel> {
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
      throw new EntityNotFoundError('Ckv', query.ckvSystemId);
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
   * Throws `ParameterDefinitionMissingError` when a payload is present but its
   * definition is absent — a database integrity violation that must not be silently
   * swallowed as a null result.
   */
  private buildParameterDataModels(
    payloads: ParameterPayloadReadModel[],
    definitions: ParameterDefinitionReadModel[],
  ): ParameterCalibrationReadModel[] {
    // Index definitions by their PK (systemId) for O(1) lookup
    const defMap = new Map(definitions.map(d => [d.systemId, d]));

    return payloads.map(p => {
      const def = defMap.get(p.parameterSystemId);

      if (p.payload !== null && def === undefined) {
        throw new ParameterDefinitionMissingError(p.parameterSystemId);
      }

      const parsedData: ParsedElementData[] | null =
        p.payload !== null && def !== undefined
          ? parseParameterData(p.payload, def.elementsStructure)
          : null;

      return {
        parameterSystemId: p.parameterSystemId,
        changeInfo: p.changeInfo,
        parameterId: def?.parameterId ?? 0,
        name: def?.name ?? '',
        description: def?.description,
        isReadOnly: def?.isReadOnly ?? false,
        isHidden: undefined, // TODO: not present in ParameterDefinitionReadModel yet — add when DB schema exposes it
        pidType: def?.pidType ?? '',
        parsedData,
      };
    });
  }
}
