/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {DataSource} from 'typeorm';
import type {SpfModuleQueryService, CkvQueryService} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {DbCkvCalibrationQueryService} from '../module-calibration/db-ckv-calibration-query-service.js';
import type {SpfModuleRow} from '../../entity-schema/usecase-data/module/spf-module.schema.js';

/**
 * Database implementation of `SpfModuleQueryService`.
 *
 * Provides access to SPF module data and owns the `CkvQueryService` sub-service
 * for calibration data retrieval.
 */
export class DbSpfModuleQueryService implements SpfModuleQueryService {
  readonly ckvQueryService: CkvQueryService;

  constructor(
    private readonly dataSource: DataSource,
    editActionsQueryService: EditActionsQueryService,
  ) {
    this.ckvQueryService = new DbCkvCalibrationQueryService(
      dataSource,
      editActionsQueryService,
    );
  }

  /**
   * Returns the `definitionSystemId` for a given SPF module instance.
   * Throws if the module is not found.
   */
  async getModuleDefinitionSystemId(
    spfModuleSystemId: number,
  ): Promise<number> {
    const module = (await this.dataSource
      .getRepository(ENTITY_NAMES.SpfModule)
      .createQueryBuilder('m')
      .select(['m.systemId', 'm.definitionSystemId'])
      .where('m.systemId = :systemId', {systemId: spfModuleSystemId})
      .getOne()) as SpfModuleRow | null;

    if (!module) {
      throw new Error(`SpfModule not found: systemId=${spfModuleSystemId}`);
    }
    return module.definitionSystemId;
  }
}
