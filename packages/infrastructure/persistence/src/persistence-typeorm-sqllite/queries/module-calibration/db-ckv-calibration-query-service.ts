/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {DataSource} from 'typeorm';
import type {
  CkvQueryService,
  CkvReadModel,
  ParameterPayloadReadModel,
  CkvKeyValuePairReadModel,
  CkvKeyReadModel,
  CkvValueReadModel,
} from '@arc/core';
import {CHANGE_OPERATION} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {
  applyToSingle,
  applyToCollection,
} from '../edit-session/overlay-merge.js';
import type {
  CkvRow,
  CkvParameterPayloadRow,
  CkvValuesRow,
} from '../../entity-schema/usecase-data/module/spf-module-calibration-data.schema.js';
import type {EditActionRow} from '../../entity-schema/edit-session/edit-action.schema.js';
import type {ValueDefinitionRow} from '../../entity-schema/definitions/key-value/value-definition.schema.js';

/**
 * Database implementation of `CkvQueryService`.
 *
 * Applies the three-tier session overlay pattern:
 * 1. If no active session exists → return base rows directly from the DB
 * 2. If a session exists but has no edit actions for this aggregate → return base rows
 * 3. If edit actions exist → merge them over the base rows using `applyToSingle` / `applyToCollection`
 *
 * Note: The upstream schema change replaced the `keyVector` relation on `CkvRow` with a
 * direct `values` join table (`CkvValues`). Key-value pairs are now accessed via
 * `ckv.values[].valueDef.keys`.
 */
export class DbCkvCalibrationQueryService implements CkvQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsQueryService: EditActionsQueryService,
  ) {}

  /**
   * Retrieves a single CKV row with its key-value pairs,
   * applying any active session overlay.
   */
  async getCkv(
    fileSystemId: number,
    ckvSystemId: number,
  ): Promise<CkvReadModel | null> {
    const session =
      await this.editActionsQueryService.findActiveSession(fileSystemId);
    if (!session) return this.queryCkvRow(ckvSystemId);

    const editActions =
      await this.editActionsQueryService.getEditActionsByAggregateId(
        session.sessionId,
        ckvSystemId,
      );
    if (editActions.length === 0) return this.queryCkvRow(ckvSystemId);

    const baseCkv = await this.queryCkvRowRaw(ckvSystemId);
    const ckvAction =
      editActions.find(
        a => a.tableName === ENTITY_NAMES.Ckv && a.systemId === ckvSystemId,
      ) ?? null;

    const overlaidCkv = applyToSingle(baseCkv, ckvAction);
    if (!overlaidCkv) return null;

    // CkvValues uses a composite key (ckvSystemId + valueDefSystemId) so it cannot
    // be overlaid with applyToCollection. The key-value pairs are returned as-is
    // from the base row; only the CKV row itself is overlaid.
    return this.transformToCkvReadModel(overlaidCkv, ckvAction ?? undefined);
  }

  /**
   * Retrieves parameter payload rows for a CKV, applying any active session overlay.
   * Optionally filtered to a specific set of parameter system IDs.
   */
  async getCkvPayloads(
    fileSystemId: number,
    ckvSystemId: number,
    paramSystemIds?: number[],
  ): Promise<ParameterPayloadReadModel[]> {
    const session =
      await this.editActionsQueryService.findActiveSession(fileSystemId);
    if (!session) return this.queryCkvPayloads(ckvSystemId, paramSystemIds);

    const editActions =
      await this.editActionsQueryService.getEditActionsByAggregateId(
        session.sessionId,
        ckvSystemId,
      );
    if (editActions.length === 0)
      return this.queryCkvPayloads(ckvSystemId, paramSystemIds);

    const payloadActions = editActions.filter(
      a => a.tableName === ENTITY_NAMES.CkvParameterPayload,
    );
    const basePayloads = await this.queryCkvPayloadsRaw(ckvSystemId);
    const overlaidPayloads = applyToCollection(basePayloads, payloadActions);

    const filtered = paramSystemIds
      ? overlaidPayloads.filter(p =>
          paramSystemIds.includes(p.parameterSystemId),
        )
      : overlaidPayloads;

    return filtered.map(p =>
      this.transformToParameterCalibrationReadModel(
        p,
        payloadActions.find(a => a.systemId === p.systemId),
      ),
    );
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async queryCkvRow(ckvSystemId: number): Promise<CkvReadModel | null> {
    const row = await this.queryCkvRowRaw(ckvSystemId);
    return row ? this.transformToCkvReadModel(row) : null;
  }

  private async queryCkvRowRaw(ckvSystemId: number): Promise<CkvRow | null> {
    return this.dataSource
      .getRepository(ENTITY_NAMES.Ckv)
      .createQueryBuilder('ckv')
      .leftJoinAndSelect('ckv.values', 'ckvValues')
      .leftJoinAndSelect('ckvValues.valueDef', 'valueDef')
      .leftJoinAndSelect('valueDef.keys', 'keyDef')
      .where('ckv.systemId = :ckvSystemId', {ckvSystemId})
      .getOne() as Promise<CkvRow | null>;
  }

  private async queryCkvPayloads(
    ckvSystemId: number,
    paramSystemIds?: number[],
  ): Promise<ParameterPayloadReadModel[]> {
    const rows = await this.queryCkvPayloadsRaw(ckvSystemId, paramSystemIds);
    return rows.map(r => this.transformToParameterCalibrationReadModel(r));
  }

  private async queryCkvPayloadsRaw(
    ckvSystemId: number,
    paramSystemIds?: number[],
  ): Promise<CkvParameterPayloadRow[]> {
    const qb = this.dataSource
      .getRepository(ENTITY_NAMES.CkvParameterPayload)
      .createQueryBuilder('payload')
      .where('payload.ckvSystemId = :ckvSystemId', {ckvSystemId});
    if (paramSystemIds && paramSystemIds.length > 0) {
      qb.andWhere('payload.parameterSystemId IN (:...ids)', {
        ids: paramSystemIds,
      });
    }
    return qb.getMany() as Promise<CkvParameterPayloadRow[]>;
  }

  private transformToCkvReadModel(
    row: CkvRow,
    editAction?: EditActionRow,
  ): CkvReadModel {
    return {
      systemId: row.systemId,
      changeInfo: editAction
        ? {
            changeType: editAction.operation,
            changeId: editAction.changeId,
            changeStatus: editAction.changeStatus,
          }
        : {changeType: CHANGE_OPERATION.None},
      spfModuleSystemId: row.spfModuleSystemId,
      uiPersistence: row.uiPersistence ?? null,
      keyValuePairs: this.buildKeyValuePairs(row.values),
    };
  }

  private transformToParameterCalibrationReadModel(
    row: CkvParameterPayloadRow,
    editAction?: EditActionRow,
  ): ParameterPayloadReadModel {
    return {
      systemId: row.systemId,
      changeInfo: editAction
        ? {
            changeType: editAction.operation,
            changeId: editAction.changeId,
            changeStatus: editAction.changeStatus,
          }
        : {changeType: CHANGE_OPERATION.None},
      parameterSystemId: row.parameterSystemId,
      payload: row.payload ?? null,
    };
  }

  /**
   * Builds key-value pair read models from the `CkvValues` join table.
   * Each `CkvValuesRow` links a CKV to a `ValueDefinitionRow` which has a `KeyDefinitionRow`.
   */
  private buildKeyValuePairs(
    values: CkvValuesRow[] | undefined,
  ): CkvKeyValuePairReadModel[] {
    if (!values || values.length === 0) return [];
    return values
      .filter(v => v.valueDef && v.valueDef.keys)
      .map(v => {
        const valueDef = v.valueDef as ValueDefinitionRow;
        return {
          key: {
            systemId: valueDef.keys.systemId,
            changeInfo: {changeType: CHANGE_OPERATION.None},
            keyId: valueDef.keys.keyId,
            name: valueDef.keys.name,
          } as CkvKeyReadModel,
          value: {
            systemId: valueDef.systemId,
            changeInfo: {changeType: CHANGE_OPERATION.None},
            valueId: valueDef.valueId,
            name: valueDef.name,
          } as CkvValueReadModel,
        };
      });
  }
}
