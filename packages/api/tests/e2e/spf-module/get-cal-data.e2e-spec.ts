/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import request from 'supertest';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';
import {INestApplication} from '@nestjs/common';
import {setupE2ETest, teardownE2ETest} from '../helpers/e2e-test-setup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('GET /arc-api/v1/projects/:projectId/spf-modules/:spfModuleSystemId/cal-data/:ckvSystemId', () => {
  let app: INestApplication;
  let httpServer: any;
  let authToken: string;

  beforeAll(async () => {
    // Create and initialize the test app with in-memory database
    const testSetup = await setupE2ETest();
    app = testSetup.app;
    httpServer = testSetup.httpServer;
    authToken = testSetup.authToken;
  });

  afterAll(async () => {
    // Properly close the application and clean up resources
    await teardownE2ETest(app);
  });

  it('should successfully retrieve calibration data for a CKV', async () => {
    // Step 1: Upload files
    const acdbPath = join(__dirname, '../fixtures/acdb_cal.acdb');
    const awspPath = join(__dirname, '../fixtures/workspaceFileXml.awsp');

    const uploadResponse = await request(httpServer)
      .post('/arc-api/v1/projects/offline/upload-files')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('acdbFile', acdbPath)
      .attach('workspaceFile', awspPath)
      .timeout(300000) // 5 minutes timeout
      .expect(201);

    // Verify upload response
    expect(uploadResponse.body).toBeDefined();
    expect(uploadResponse.body.success).toBe(true);
    expect(uploadResponse.body.data).toBeDefined();
    expect(uploadResponse.body.data.projectId).toBeDefined();

    const projectId = uploadResponse.body.data.projectId;

    // Step 2: Get all usecases
    const usecasesResponse = await request(httpServer)
      .get(`/arc-api/v1/projects/${projectId}/usecases/`)
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000)
      .expect(200);

    // Verify usecases response
    expect(usecasesResponse.body).toBeDefined();
    expect(usecasesResponse.body.success).toBe(true);
    expect(usecasesResponse.body.data).toBeDefined();
    expect(Array.isArray(usecasesResponse.body.data)).toBe(true);
    expect(usecasesResponse.body.data.length).toBeGreaterThan(0);

    // Extract usecase systemId
    // The API returns an array of UsecaseDto objects directly
    const usecasesData = usecasesResponse.body.data;
    const firstUsecaseDto = usecasesData[0];
    expect(firstUsecaseDto.systemId).toBeDefined();
    expect(firstUsecaseDto.keyValueCollection).toBeDefined();
    expect(Array.isArray(firstUsecaseDto.keyValueCollection)).toBe(true);

    // Select a random usecase from the array
    const randomIndex = Math.floor(Math.random() * usecasesData.length);
    const randomUsecase = usecasesData[randomIndex];
    const firstUsecaseSystemId = randomUsecase.systemId;

    // Step 3: Get components for the usecase
    const componentsResponse = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/usecases/components/query`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        systemIds: [firstUsecaseSystemId],
      })
      .timeout(30000)
      .expect(201);

    // Verify components response
    expect(componentsResponse.body).toBeDefined();
    expect(componentsResponse.body.success).toBe(true);
    expect(componentsResponse.body.data).toBeDefined();
    expect(typeof componentsResponse.body.data).toBe('object');

    const componentsData = componentsResponse.body.data;
    expect(componentsData.spfModules).toBeDefined();
    expect(Array.isArray(componentsData.spfModules)).toBe(true);
    expect(componentsData.spfModules.length).toBeGreaterThan(0);

    // Extract first spfModule systemId
    const firstSpfModuleSystemId = componentsData.spfModules[0].systemId;

    // Step 4: Query spf-module with include=ckvs to get CKV information
    const spfModuleQueryResponse = await request(httpServer)
      .post(`/arc-api/v1/projects/${projectId}/spf-modules/query?include=ckvs`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        systemIds: [firstSpfModuleSystemId],
      })
      .timeout(30000)
      .expect(200);

    // Verify spf-module query response
    expect(spfModuleQueryResponse.body).toBeDefined();
    expect(spfModuleQueryResponse.body.success).toBe(true);
    expect(spfModuleQueryResponse.body.data).toBeDefined();
    expect(Array.isArray(spfModuleQueryResponse.body.data)).toBe(true);
    expect(spfModuleQueryResponse.body.data.length).toBeGreaterThan(0);

    const spfModuleData = spfModuleQueryResponse.body.data[0];
    expect(spfModuleData.ckvs).toBeDefined();
    expect(Array.isArray(spfModuleData.ckvs)).toBe(true);
    expect(spfModuleData.ckvs.length).toBeGreaterThan(0);

    // Extract first CKV systemId
    const firstCkvSystemId = spfModuleData.ckvs[0].systemId;

    // Step 5: Get calibration data for the CKV
    const calDataResponse = await request(httpServer)
      .get(
        `/arc-api/v1/projects/${projectId}/spf-modules/${firstSpfModuleSystemId}/cal-data/${firstCkvSystemId}`,
      )
      .set('Authorization', `Bearer ${authToken}`)
      .timeout(30000)
      .expect(200);

    // Step 6: Verify calibration data response structure
    expect(calDataResponse.body).toBeDefined();
    expect(calDataResponse.body.success).toBe(true);
    expect(calDataResponse.body.message).toBeDefined();
    expect(calDataResponse.body.data).toBeDefined();

    const calData = calDataResponse.body.data;

    // Verify parameters array
    expect(calData.parameters).toBeDefined();
    expect(Array.isArray(calData.parameters)).toBe(true);

    // Log summary for debugging
    console.log(`\nCalibration Data Summary:`);
    console.log(`  Project ID: ${projectId}`);
    console.log(`  Usecase ID: ${firstUsecaseSystemId}`);
    console.log(`  SPF Module ID: ${firstSpfModuleSystemId}`);
    console.log(`  CKV ID: ${firstCkvSystemId}`);
    console.log(`  Total Parameters: ${calData.parameters.length}`);
  }, 350000); // 350 seconds Jest timeout
});
